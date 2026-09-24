const REVIEW_IMAGE_PROXY_PATH = '/api/v1/review-images';
const GOOGLE_REVIEW_IMAGE_HOST = 'lh3.googleusercontent.com';
const WIDGET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REVIEW_ID_LENGTH = 512;

export interface ReviewImageProxyContext {
  widgetId?: string;
  reviewId?: string;
}

/**
 * Only Google-hosted review photos may pass through the image proxy. Keeping
 * this allowlist deliberately narrow prevents the route from becoming an
 * arbitrary server-side request proxy.
 */
export function parseGoogleReviewImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== GOOGLE_REVIEW_IMAGE_HOST ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Returns the stable Google photo identifier shared by differently sized
 * variants of the same review image. Google puts its size directive after the
 * final `=` in these URLs (for example, `=w120-h120-c`).
 */
export function googleReviewImageIdentity(value: string): string | null {
  const url = parseGoogleReviewImageUrl(value);
  if (!url) return null;

  return url.href.replace(/=[^=]*$/, '');
}

/** A widget ID is a database UUID, so ignore preview/new-widget placeholders. */
export function isReviewImageWidgetId(value: unknown): value is string {
  return typeof value === 'string' && WIDGET_ID_PATTERN.test(value);
}

/**
 * Review IDs come from Google and are opaque, but they must be bounded and
 * single-line before they are propagated to a public fallback URL.
 */
export function isReviewImageReviewId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_REVIEW_ID_LENGTH
    && !/[\u0000-\u001F\u007F]/.test(value);
}

/**
 * Returns the stable, same-service URL used for Google review photos. Loading
 * through the proxy first lets the widget CDN preserve the image bytes before
 * Google's signed source URL expires. Non-Google images remain untouched.
 */
export function reviewImageProxyUrl(
  src: string,
  apiOrigin = '',
  context: ReviewImageProxyContext = {},
): string {
  if (!parseGoogleReviewImageUrl(src)) return src;
  const origin = apiOrigin.replace(/\/+$/, '');
  const params = [`url=${encodeURIComponent(src)}`];

  // Context is used only if the proxy request itself fails. The server verifies
  // it against cached widget data before including it in an operational log.
  if (isReviewImageWidgetId(context.widgetId)) {
    params.push(`widgetId=${encodeURIComponent(context.widgetId)}`);
    if (isReviewImageReviewId(context.reviewId)) {
      params.push(`reviewId=${encodeURIComponent(context.reviewId)}`);
    }
  }

  return `${origin}${REVIEW_IMAGE_PROXY_PATH}?${params.join('&')}`;
}

/** Proxy first for durability; retain the original as a best-effort fallback. */
export function reviewImageCandidates(
  src: string,
  apiOrigin = '',
  context: ReviewImageProxyContext = {},
): string[] {
  return [...new Set([reviewImageProxyUrl(src, apiOrigin, context), src])];
}
