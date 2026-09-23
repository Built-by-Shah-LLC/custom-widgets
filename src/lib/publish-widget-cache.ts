import { dangerouslyDeleteByTag } from '@vercel/functions';
import { widgetCacheTag } from './cache-headers';
import { laggingCache, type LiveCacheResult } from './live-cache-warning';

const WARM_RETRY_DELAY_MS = 400;
const WARM_TIMEOUT_MS = 8_000;

type DeleteByTag = (
  tag: string | string[],
  options?: { revalidationDeadlineSeconds?: number }
) => Promise<unknown>;

export interface PublishWidgetCacheDeps {
  deleteByTag?: DeleteByTag;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Production saves warm the canonical production hostname, which is the host
 * customer snippets use. Preview saves warm the preview origin, because a
 * preview purge does not clear production. Local saves have no CDN.
 */
export function resolveWidgetPublishHost(
  requestOrigin: string,
  env: { VERCEL_ENV?: string; VERCEL_PROJECT_PRODUCTION_URL?: string }
): string {
  if (env.VERCEL_ENV !== 'production') return requestOrigin;
  const productionHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/+$/, '');
  if (!productionHost) return requestOrigin;
  const host = productionHost.replace(/^https?:\/\//, '');
  return `https://${host}`;
}

function dataJsUrl(widgetHost: string, widgetId: string): string | null {
  let url: URL;
  try {
    url = new URL(widgetHost);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return `${url.origin}/api/embeds/widget/${encodeURIComponent(widgetId)}/data.js`;
}

function cacheFill(response: Response): 'stored' | 'hit' | 'unknown' {
  const value = response.headers.get('x-vercel-cache')?.trim().toUpperCase() ?? '';
  if (value === 'MISS' || value === 'REVALIDATED') return 'stored';
  if (value === 'HIT') return 'hit';
  return 'unknown';
}

/**
 * HIT means the previous object is still being served. A 404/403 is no-store,
 * so anything other than HIT means the old widget is gone. A 200 without a
 * cache label is the new body, not a 24h lag.
 */
export function warmResponseSettled(response: Response): boolean {
  if (cacheFill(response) === 'hit') return false;
  if (cacheFill(response) === 'stored') return true;
  if (response.status === 400 || response.status === 403 || response.status === 404) {
    return true;
  }
  return response.status >= 200 && response.status < 300;
}

async function deleteTags(tags: string[], deleteByTag: DeleteByTag): Promise<boolean> {
  const options = { revalidationDeadlineSeconds: 0 };
  try {
    await deleteByTag(tags, options);
    return true;
  } catch {
    try {
      await deleteByTag(tags, options);
      return true;
    } catch {
      return false;
    }
  }
}

async function requestData(url: string, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    // Skip Next's data cache. The CDN decision is the data.js response headers.
    cache: 'no-store',
    signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
  });
}

async function warmWidget(
  widgetHost: string,
  widgetId: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>
): Promise<boolean> {
  const url = dataJsUrl(widgetHost, widgetId);
  if (!url) return false;

  let first: Response;
  try {
    first = await requestData(url, fetchImpl);
  } catch {
    return false;
  }

  if (warmResponseSettled(first)) return true;
  if (cacheFill(first) !== 'hit') return false;

  await sleep(WARM_RETRY_DELAY_MS);
  try {
    const second = await requestData(url, fetchImpl);
    return warmResponseSettled(second);
  } catch {
    return false;
  }
}

/**
 * Hard-deletes widget-<id> on every Vercel edge, then GETs data.js once.
 * The GET has no Origin or Referer, so data.js does not store it. The purge
 * drops every caller's copy; the next allowed page load stores its own.
 * widget.js is not tagged and is not requested here.
 */
export async function publishWidgetCache(
  widgetIds: string[],
  widgetHost: string,
  deps: PublishWidgetCacheDeps = {}
): Promise<LiveCacheResult> {
  const tags = [
    ...new Set(
      widgetIds
        .map((id) => widgetCacheTag(id))
        .filter((tag): tag is string => Boolean(tag))
    ),
  ];
  if (tags.length === 0) return { fresh: true };

  const deleteByTag =
    deps.deleteByTag ?? (process.env.VERCEL === '1' ? dangerouslyDeleteByTag : null);
  if (!deleteByTag) return { fresh: true };

  const deleted = await deleteTags(tags, deleteByTag);
  if (!deleted) return laggingCache();

  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const ids = tags.map((tag) => tag.slice('widget-'.length));
  const warmed = await Promise.all(
    ids.map((id) => warmWidget(widgetHost, id, fetchImpl, sleep))
  );
  if (warmed.some((ok) => !ok)) return laggingCache();
  return { fresh: true };
}
