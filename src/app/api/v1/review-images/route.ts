import { createHash, randomUUID } from 'node:crypto';
import {
  googleReviewImageIdentity,
  isReviewImageReviewId,
  isReviewImageWidgetId,
  parseGoogleReviewImageUrl,
} from '@/lib/review-images';

const PUBLIC_IMAGE_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
const ERROR_CACHE = 'no-store';
const UNAVAILABLE_IMAGE_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
const UPSTREAM_TIMEOUT_MS = 10_000;
const CONTEXT_LOOKUP_TIMEOUT_MS = 1_500;
const LOG_PREFIX = '[review-image-proxy]';

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
};

type ReviewImageRequestContext = {
  widgetId: string | null;
  reviewId: string | null;
};

type UnknownRecord = Record<string, unknown>;

function sourceDetails(sourceUrl: URL) {
  const pathSegment = sourceUrl.pathname.split('/').filter(Boolean)[0] ?? null;

  return {
    // Google review image paths contain opaque identifiers. Hash the complete
    // URL so separate failures can still be correlated without logging it.
    sourceFingerprint: createHash('sha256').update(sourceUrl.href).digest('hex').slice(0, 16),
    sourceHost: sourceUrl.hostname,
    sourcePathSegment: pathSegment,
  };
}

function safeLogText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;

  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, '<url>')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function reviewImageRequestContext(request: Request): ReviewImageRequestContext {
  const params = new URL(request.url).searchParams;
  return {
    widgetId: params.get('widgetId'),
    reviewId: params.get('reviewId'),
  };
}

function widgetSurface(widgetType: string | null): 'badge' | 'carousel' | null {
  if (widgetType === 'google_reviews') return 'badge';
  if (widgetType === 'google_reviews_carousel') return 'carousel';
  return null;
}

function businessNameFromJoin(value: unknown): string | null {
  const joinedBusiness = asRecord(Array.isArray(value) ? value[0] : value);
  return safeLogText(joinedBusiness?.name, 160);
}

function widgetFields(widget: UnknownRecord) {
  const type = nonEmptyString(widget.widget_type);
  const surface = widgetSurface(type);

  return {
    widgetId: nonEmptyString(widget.id),
    widgetName: safeLogText(widget.name, 160),
    widgetType: type,
    widgetSurface: surface,
    businessId: nonEmptyString(widget.business_id),
    businessName: businessNameFromJoin(widget.businesses),
  };
}

function reviewMatchesSource(review: UnknownRecord, sourceUrl: URL): boolean {
  const sourceIdentity = googleReviewImageIdentity(sourceUrl.href);
  if (!sourceIdentity || !Array.isArray(review.images)) return false;

  return review.images.some((image) => googleReviewImageIdentity(String(image)) === sourceIdentity);
}

/**
 * The image endpoint is public, so query-string context is not trusted on its
 * own. On a failure only, verify the widget, review, and original Google
 * photo against the cached server-side widget payload before logging names or
 * IDs that identify a customer widget.
 */
async function resolveWidgetLogContext(
  sourceUrl: URL,
  context: ReviewImageRequestContext,
) {
  if (context.widgetId === null && context.reviewId === null) {
    return { contextStatus: 'not_provided' };
  }
  if (!isReviewImageWidgetId(context.widgetId)) {
    return { contextStatus: 'invalid_widget_id' };
  }
  if (context.reviewId !== null && !isReviewImageReviewId(context.reviewId)) {
    return { contextStatus: 'invalid_review_id' };
  }

  try {
    // This import stays inside the failure-only path. Successful cached image
    // proxy requests never load the service-role client or query Supabase.
    const { supabase } = await import('@/lib/db');
    const { data, error } = await supabase
      .from('widgets')
      .select('id, name, widget_type, business_id, cached_reviews, businesses(name)')
      .eq('id', context.widgetId)
      .abortSignal(AbortSignal.timeout(CONTEXT_LOOKUP_TIMEOUT_MS))
      .maybeSingle();

    if (error) {
      return {
        contextStatus: 'lookup_failed',
        contextLookupCode: safeLogText(error.code, 120),
      };
    }

    const widget = asRecord(data);
    if (!widget) return { contextStatus: 'widget_not_found' };

    const fields = widgetFields(widget);
    if (fields.widgetId !== context.widgetId) {
      return { contextStatus: 'widget_lookup_mismatch' };
    }
    if (!fields.widgetSurface) {
      return { contextStatus: 'unsupported_widget_type' };
    }
    if (!context.reviewId) {
      return {
        contextStatus: 'widget_verified_review_not_provided',
        ...fields,
      };
    }

    const reviews = Array.isArray(widget.cached_reviews) ? widget.cached_reviews : [];
    const review = reviews
      .map(asRecord)
      .find((candidate) =>
        candidate !== null
        && (nonEmptyString(candidate.id) ?? nonEmptyString(candidate.google_review_id)) === context.reviewId
      );

    if (!review) {
      return { contextStatus: 'review_not_found', ...fields };
    }
    if (!reviewMatchesSource(review, sourceUrl)) {
      return { contextStatus: 'source_not_matched', ...fields };
    }

    return {
      contextStatus: 'verified',
      ...fields,
      reviewId: context.reviewId,
      reviewAuthorName: safeLogText(review.authorName ?? review.author_name, 160),
    };
  } catch (error) {
    return {
      contextStatus: 'lookup_failed',
      contextLookupError: safeLogText(
        error && typeof error === 'object' ? (error as ErrorLike).name : null,
        120,
      ),
    };
  }
}

function errorDetails(error: unknown) {
  const errorLike = error && typeof error === 'object' ? error as ErrorLike : null;
  const cause = errorLike?.cause && typeof errorLike.cause === 'object'
    ? errorLike.cause as ErrorLike
    : null;

  return {
    name: safeLogText(errorLike?.name) ?? 'UnknownError',
    message: safeLogText(errorLike?.message),
    code: safeLogText(errorLike?.code, 120),
    cause: cause
      ? {
          name: safeLogText(cause.name) ?? 'UnknownError',
          message: safeLogText(cause.message),
          code: safeLogText(cause.code, 120),
        }
      : null,
  };
}

function redirectHost(response: Response): string | null {
  const location = response.headers.get('location');
  if (!location) return null;

  try {
    return new URL(location).hostname;
  } catch {
    return 'invalid-location-header';
  }
}

function unavailableResponse() {
  return new Response('Review image unavailable', {
    status: 404,
    headers: { 'Cache-Control': UNAVAILABLE_IMAGE_CACHE },
  });
}

function gatewayErrorResponse(requestId: string) {
  return new Response('Review image unavailable', {
    status: 502,
    headers: {
      'Cache-Control': ERROR_CACHE,
      // This is generated per failed proxy attempt and is safe to give a
      // customer/support report. It links the browser response to the log.
      'X-Request-Id': requestId,
    },
  });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const requestUrl = new URL(request.url);
  const source = requestUrl.searchParams.get('url');
  const sourceUrl = source ? parseGoogleReviewImageUrl(source) : null;

  if (!sourceUrl) {
    return new Response('Invalid review image URL', {
      status: 400,
      headers: { 'Cache-Control': ERROR_CACHE },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(sourceUrl, {
      cache: 'force-cache',
      redirect: 'manual',
      next: { revalidate: 604800 },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
  } catch (error) {
    const widgetContext = await resolveWidgetLogContext(
      sourceUrl,
      reviewImageRequestContext(request),
    );
    console.error(LOG_PREFIX, {
      event: 'review_image_proxy.upstream_fetch_failed',
      requestId,
      vercelRequestId: request.headers.get('x-vercel-id'),
      elapsedMs: Date.now() - startedAt,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      ...sourceDetails(sourceUrl),
      ...widgetContext,
      error: errorDetails(error),
    });

    return gatewayErrorResponse(requestId);
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !contentType.toLowerCase().startsWith('image/') || !upstream.body) {
    const widgetContext = await resolveWidgetLogContext(
      sourceUrl,
      reviewImageRequestContext(request),
    );
    const sourceUnavailable = [401, 403, 404, 410].includes(upstream.status);
    const logContext = {
      event: sourceUnavailable
        ? 'review_image_proxy.source_unavailable'
        : 'review_image_proxy.invalid_upstream_response',
      requestId,
      vercelRequestId: request.headers.get('x-vercel-id'),
      elapsedMs: Date.now() - startedAt,
      ...sourceDetails(sourceUrl),
      ...widgetContext,
      upstreamStatus: upstream.status,
      upstreamContentType: contentType || null,
      upstreamContentLength: upstream.headers.get('content-length'),
      upstreamRedirectHost: redirectHost(upstream),
      hasUpstreamBody: Boolean(upstream.body),
    };

    if (sourceUnavailable) {
      // A Google 403/404 normally means an expired or restricted review-photo
      // URL. It is not a failure of this service, and a short cache prevents
      // every widget render from retrying the same unusable image.
      console.warn(LOG_PREFIX, logContext);
      return unavailableResponse();
    }

    console.error(LOG_PREFIX, logContext);
    return gatewayErrorResponse(requestId);
  }

  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': PUBLIC_IMAGE_CACHE,
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);

  return new Response(upstream.body, { headers });
}
