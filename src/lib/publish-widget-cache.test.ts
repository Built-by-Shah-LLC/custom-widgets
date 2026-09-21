import { describe, expect, it, vi } from 'vitest';
import {
  WIDGET_SCRIPT_CACHE_HEADERS,
  publicWidgetDataHeaders,
} from './cache-headers';
import { LIVE_CACHE_LAG_MESSAGE } from './live-cache-warning';
import { publishWidgetCache } from './publish-widget-cache';

const WIDGET_ID = '004a7b18-6bcc-4b2a-a8f9-454012312690';
const OTHER_ID = '1cb98d3c-e962-45be-8fac-5859aa7143b8';
const HOST = 'https://builtbyshahwidgets.com';

function response(cache: string | null, status = 200) {
  const headers = new Headers();
  if (cache) headers.set('x-vercel-cache', cache);
  return new Response('ok', { status, headers });
}

describe('public widget cache headers', () => {
  it('tells the browser to revalidate and Vercel to hold data for 24h', () => {
    const headers = publicWidgetDataHeaders(WIDGET_ID);
    expect(headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
    expect(headers['Vercel-CDN-Cache-Control']).toBe('public, max-age=86400');
    expect(headers['Vercel-Cache-Tag']).toBe(`widget-${WIDGET_ID}`);
    expect(JSON.stringify(headers)).not.toContain('no-store');
    expect(JSON.stringify(headers)).not.toContain('stale-while-revalidate');
  });

  it('caches widget.js for 24h without a widget tag', () => {
    expect(WIDGET_SCRIPT_CACHE_HEADERS['Cache-Control']).toBe(
      'public, max-age=0, must-revalidate'
    );
    expect(WIDGET_SCRIPT_CACHE_HEADERS['Vercel-CDN-Cache-Control']).toBe(
      'public, max-age=86400'
    );
    expect(WIDGET_SCRIPT_CACHE_HEADERS).not.toHaveProperty('Vercel-Cache-Tag');
  });
});

describe('publishWidgetCache', () => {
  it('does nothing off Vercel when no purge function is injected', async () => {
    const previous = process.env.VERCEL;
    delete process.env.VERCEL;
    try {
      const fetchImpl = vi.fn();
      const result = await publishWidgetCache([WIDGET_ID], HOST, { fetch: fetchImpl });
      expect(result).toEqual({ fresh: true });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it('hard-deletes only that widget tag, then stores a MISS', async () => {
    const deleteByTag = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(response('MISS'));
    const result = await publishWidgetCache([WIDGET_ID], HOST, {
      deleteByTag,
      fetch: fetchImpl,
    });

    expect(result).toEqual({ fresh: true });
    expect(deleteByTag).toHaveBeenCalledTimes(1);
    expect(deleteByTag).toHaveBeenCalledWith([`widget-${WIDGET_ID}`], {
      revalidationDeadlineSeconds: 0,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${HOST}/api/embeds/widget/${WIDGET_ID}/data.js`
    );
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain('widget.js');
  });

  it('treats REVALIDATED as the new body being stored', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('REVALIDATED'));
    const result = await publishWidgetCache([WIDGET_ID], HOST, {
      deleteByTag: vi.fn().mockResolvedValue(undefined),
      fetch: fetchImpl,
    });
    expect(result).toEqual({ fresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('waits and tries once more when the first warm is still a HIT', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('HIT'))
      .mockResolvedValueOnce(response('MISS'));
    const result = await publishWidgetCache([WIDGET_ID], HOST, {
      deleteByTag: vi.fn().mockResolvedValue(undefined),
      fetch: fetchImpl,
      sleep,
    });
    expect(result).toEqual({ fresh: true });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('warns when the old object is still a HIT after the retry', async () => {
    const result = await publishWidgetCache([WIDGET_ID], HOST, {
      deleteByTag: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(response('HIT')),
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    expect(result).toEqual({
      fresh: false,
      liveCacheWarning: LIVE_CACHE_LAG_MESSAGE,
    });
  });

  it('retries a failed purge once and skips the warm if it fails again', async () => {
    const deleteByTag = vi.fn().mockRejectedValue(new Error('purge down'));
    const fetchImpl = vi.fn();
    const result = await publishWidgetCache([WIDGET_ID, WIDGET_ID], HOST, {
      deleteByTag,
      fetch: fetchImpl,
    });
    expect(deleteByTag).toHaveBeenCalledTimes(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.liveCacheWarning).toBe(LIVE_CACHE_LAG_MESSAGE);
  });

  it('retries the purge once and warms after the second attempt works', async () => {
    const deleteByTag = vi
      .fn()
      .mockRejectedValueOnce(new Error('purge down'))
      .mockResolvedValueOnce(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(response('MISS'));
    const result = await publishWidgetCache([WIDGET_ID], HOST, {
      deleteByTag,
      fetch: fetchImpl,
    });
    expect(deleteByTag).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ fresh: true });
  });

  it('deletes each widget tag and no other tag', async () => {
    const deleteByTag = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(response('MISS'));
    await publishWidgetCache([WIDGET_ID, OTHER_ID, 'not-a-widget'], HOST, {
      deleteByTag,
      fetch: fetchImpl,
    });
    expect(deleteByTag).toHaveBeenCalledWith(
      [`widget-${WIDGET_ID}`, `widget-${OTHER_ID}`],
      { revalidationDeadlineSeconds: 0 }
    );
    const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      `${HOST}/api/embeds/widget/${WIDGET_ID}/data.js`,
      `${HOST}/api/embeds/widget/${OTHER_ID}/data.js`,
    ]);
  });
});
