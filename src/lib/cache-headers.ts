// Browser always revalidates. Vercel keeps a successful widget response for
// 24h. Generic CDNs stay on max-age=0 so only Vercel holds the long copy.
// Errors stay no-store so a 403/404/503 cannot be remembered.

export const BROWSER_REVALIDATE = 'public, max-age=0, must-revalidate';

export const VERCEL_WIDGET_TTL = 'public, max-age=86400';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function widgetCacheTag(widgetId: string): string | null {
  if (!UUID_RE.test(widgetId)) return null;
  return `widget-${widgetId}`;
}

/** Successful public widget data. One tag per widget, no stale-while-revalidate. */
export function publicWidgetDataHeaders(
  widgetId: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': BROWSER_REVALIDATE,
    'CDN-Cache-Control': BROWSER_REVALIDATE,
    'Vercel-CDN-Cache-Control': VERCEL_WIDGET_TTL,
  };
  const tag = widgetCacheTag(widgetId);
  if (tag) headers['Vercel-Cache-Tag'] = tag;
  return headers;
}

export function cachedPublicJsonHeaders(
  corsHeaders: Record<string, string>,
  widgetId: string
): Record<string, string> {
  // JSON echoes Access-Control-Allow-Origin, so Vary stays on these 200s.
  // data.js also varies on Origin and Referer. A cached body is not reused
  // for a different caller.
  return {
    ...corsHeaders,
    ...publicWidgetDataHeaders(widgetId),
  };
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

export const WIDGET_NO_STORE_HEADERS = {
  ...NO_STORE_HEADERS,
  Vary: 'Origin, Referer',
};

export const WIDGET_SCRIPT_CACHE_HEADERS = {
  'Cache-Control': BROWSER_REVALIDATE,
  'CDN-Cache-Control': BROWSER_REVALIDATE,
  'Vercel-CDN-Cache-Control': VERCEL_WIDGET_TTL,
};
