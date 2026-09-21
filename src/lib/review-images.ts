const REVIEW_IMAGE_PROXY_PATH = '/api/v1/review-images';
const GOOGLE_REVIEW_IMAGE_HOST = 'lh3.googleusercontent.com';

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
 * Returns a same-service fallback URL for Google review photos. The widget
 * first tries Google directly and only uses this route when the browser is
 * blocked (for example by Chromium ORB), avoiding unnecessary proxy traffic.
 */
export function reviewImageProxyUrl(src: string, apiOrigin = ''): string {
  if (!parseGoogleReviewImageUrl(src)) return src;
  const origin = apiOrigin.replace(/\/+$/, '');
  return `${origin}${REVIEW_IMAGE_PROXY_PATH}?url=${encodeURIComponent(src)}`;
}
