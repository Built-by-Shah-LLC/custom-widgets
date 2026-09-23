import { createHash, randomUUID } from 'node:crypto';
import { after } from 'next/server';
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
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const LOG_PREFIX = '[review-image-proxy]';

const rateLimitHits = new Map<string, { count: number; resetAt: number }>();
let nextRateLimitPruneAt = 0;

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
type LogLevel = 'warn' | 'error';

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

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Per-instance protection for a public proxy endpoint. This deliberately
 * permits a full review gallery to retry through the proxy during a Google
 * outage; Vercel WAF rate limiting remains the cross-instance safeguard.
 */
function rateLimited(request: Request): boolean {
  const now = Date.now();
  if (now >= nextRateLimitPruneAt) {
    for (const [ip, entry] of rateLimitHits) {
      if (entry.resetAt <= now) rateLimitHits.delete(ip);
    }
    nextRateLimitPruneAt = now + RATE_WINDOW_MS;
  }

  const ip = clientIp(request);
  const existing = rateLimitHits.get(ip);
  if (!existing || existing.resetAt <= now) {
    if (rateLimitHits.size >= RATE_LIMIT_MAX_ENTRIES) {
      const oldestIp = rateLimitHits.keys().next().value;
      if (oldestIp) rateLimitHits.delete(oldestIp);
    }
    rateLimitHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  return existing.count > RATE_MAX;
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

function reviewFields(review: UnknownRecord) {
  return {
    reviewId: nonEmptyString(review.google_review_id),
    reviewAuthorName: safeLogText(review.author_name, 160),
  };
}

function reviewMatchesSource(review: UnknownRecord, sourceUrl: URL): boolean {
  const sourceIdentity = googleReviewImageIdentity(sourceUrl.href);
  if (!sourceIdentity || !Array.isArray(review.images)) return false;

  return review.images.some((image) => googleReviewImageIdentity(String(image)) === sourceIdentity);
}

/**
 * The image endpoint is public, so query-string context is not trusted on its
 * own. On a failure only, resolve each supplied fragment against server data.
 * Logs include every fragment that was independently verified, while their
 * status fields make missing or mismatched fragments explicit.
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

  try {
    // This import stays inside the failure-only path. Successful cached image
    // proxy requests never load the service-role client or query Supabase.
    const { supabase } = await import('@/lib/db');
    const lookupSignal = AbortSignal.timeout(CONTEXT_LOOKUP_TIMEOUT_MS);
    const { data, error } = await supabase
      .from('widgets')
      .select('id, name, widget_type, business_id, businesses(name)')
      .eq('id', context.widgetId)
      .abortSignal(lookupSignal)
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
    if (!context.reviewId) {
      return {
        contextStatus: 'widget_verified',
        reviewStatus: 'not_provided',
        sourceStatus: 'not_checked',
        ...fields,
      };
    }
    if (!isReviewImageReviewId(context.reviewId)) {
      return {
        contextStatus: 'widget_verified',
        reviewStatus: 'invalid',
        sourceStatus: 'not_checked',
        ...fields,
      };
    }

    const { data: reviewData, error: reviewError } = await supabase
      .from('reviews')
      .select('business_id, google_review_id, author_name, images')
      .eq('google_review_id', context.reviewId)
      .abortSignal(lookupSignal)
      .maybeSingle();

    if (reviewError) {
      return {
        contextStatus: 'widget_verified',
        reviewStatus: 'lookup_failed',
        sourceStatus: 'not_checked',
        reviewLookupCode: safeLogText(reviewError.code, 120),
        ...fields,
      };
    }

    const review = asRecord(reviewData);
    if (!review) {
      return {
        contextStatus: 'widget_verified',
        reviewStatus: 'not_found',
        sourceStatus: 'not_checked',
        ...fields,
      };
    }
    if (!fields.businessId || nonEmptyString(review.business_id) !== fields.businessId) {
      return {
        contextStatus: 'widget_verified',
        reviewStatus: 'business_mismatch',
        sourceStatus: 'not_checked',
        ...fields,
      };
    }

    const verifiedReviewFields = reviewFields(review);
    if (!reviewMatchesSource(review, sourceUrl)) {
      return {
        contextStatus: 'review_verified',
        reviewStatus: 'verified',
        sourceStatus: 'mismatch',
        ...fields,
        ...verifiedReviewFields,
      };
    }

    return {
      contextStatus: 'verified',
      reviewStatus: 'verified',
      sourceStatus: 'verified',
      ...fields,
      ...verifiedReviewFields,
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

function scheduleFailureLog(
  level: LogLevel,
  sourceUrl: URL,
  context: ReviewImageRequestContext,
  logContext: UnknownRecord,
) {
  // Diagnostic enrichment is intentionally outside the image response's
  // critical path. `after()` keeps Vercel's function alive for the log work.
  after(async () => {
    const widgetContext = await resolveWidgetLogContext(sourceUrl, context);
    const message = { ...logContext, ...widgetContext };
    if (level === 'warn') {
      console.warn(LOG_PREFIX, message);
    } else {
      console.error(LOG_PREFIX, message);
    }
  });
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

function rateLimitedResponse() {
  return new Response('Too many review image requests', {
    status: 429,
    headers: {
      'Cache-Control': ERROR_CACHE,
      'Retry-After': '60',
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

  if (rateLimited(request)) return rateLimitedResponse();
  const requestContext = reviewImageRequestContext(request);

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
    scheduleFailureLog(
      'error',
      sourceUrl,
      requestContext,
      {
        event: 'review_image_proxy.upstream_fetch_failed',
        requestId,
        vercelRequestId: request.headers.get('x-vercel-id'),
        elapsedMs: Date.now() - startedAt,
        timeoutMs: UPSTREAM_TIMEOUT_MS,
        ...sourceDetails(sourceUrl),
        error: errorDetails(error),
      },
    );

    return gatewayErrorResponse(requestId);
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !contentType.toLowerCase().startsWith('image/') || !upstream.body) {
    const sourceUnavailable = [401, 403, 404, 410].includes(upstream.status);
    const logContext = {
      event: sourceUnavailable
        ? 'review_image_proxy.source_unavailable'
        : 'review_image_proxy.invalid_upstream_response',
      requestId,
      vercelRequestId: request.headers.get('x-vercel-id'),
      elapsedMs: Date.now() - startedAt,
      ...sourceDetails(sourceUrl),
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
      scheduleFailureLog('warn', sourceUrl, requestContext, logContext);
      return unavailableResponse();
    }

    scheduleFailureLog('error', sourceUrl, requestContext, logContext);
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
