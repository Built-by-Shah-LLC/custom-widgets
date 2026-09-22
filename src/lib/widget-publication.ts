import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from './cache-headers';
import { listAllEmbedWidgetIds } from './embed-widget-ids';
import { laggingCache, withLiveCacheWarning, type LiveCacheResult } from './live-cache-warning';
import { publishWidgetCache, resolveWidgetPublishHost } from './publish-widget-cache';

export async function publishEmbedWidgets(
  request: Request,
  widgetIds: string[]
): Promise<LiveCacheResult> {
  try {
    return await publishWidgetCache(
      widgetIds,
      resolveWidgetPublishHost(new URL(request.url).origin, process.env)
    );
  } catch {
    return laggingCache();
  }
}

export async function publishAllEmbedWidgets(request: Request): Promise<LiveCacheResult> {
  try {
    return await publishEmbedWidgets(request, await listAllEmbedWidgetIds());
  } catch {
    return laggingCache();
  }
}

export function jsonSaved<T extends object>(
  body: T,
  cache: LiveCacheResult,
  status = 200
) {
  return NextResponse.json(withLiveCacheWarning(body, cache), {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export function deletedResponse(cache: LiveCacheResult) {
  if (cache.liveCacheWarning) {
    return NextResponse.json(
      { deleted: true, liveCacheWarning: cache.liveCacheWarning },
      { headers: NO_STORE_HEADERS }
    );
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
}
