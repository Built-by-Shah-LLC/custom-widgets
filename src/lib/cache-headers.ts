// Mutable widget data remains uncached until publication ordering and CDN
// invalidation are proven. Keep all provider-specific directives explicit so
// a platform default cannot silently reintroduce stale data.
export const WIDGET_CACHE_CONTROL = 'no-store, must-revalidate';

export const NO_STORE = 'no-store, must-revalidate';

export const WIDGET_DATA_CACHE_HEADERS = {
  'Cache-Control': WIDGET_CACHE_CONTROL,
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export const NO_STORE_HEADERS = {
  'Cache-Control': NO_STORE,
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export const WIDGET_NO_STORE_HEADERS = {
  ...NO_STORE_HEADERS,
  Vary: 'Origin, Referer',
};

export const WIDGET_SCRIPT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  // Keep generic intermediaries on revalidation; only Vercel receives the
  // longer deployment-scoped TTL below.
  'CDN-Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'public, max-age=86400',
};
