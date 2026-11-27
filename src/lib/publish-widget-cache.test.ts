import { describe, expect, it, vi } from 'vitest';
import { publicWidgetDataHeaders, WIDGET_SCRIPT_CACHE_HEADERS } from './cache-headers';
import { LIVE_CACHE_LAG_MESSAGE } from './live-cache-warning';
import { publishWidgetCache } from './publish-widget-cache';

const ID = '004a7b18-6bcc-4b2a-a8f9-454012312690';
const OTHER_ID = '1cb98d3c-e962-45be-8fac-5859aa7143b8';

describe('public widget cache headers', () => {
  it('requires browser revalidation and tags the CDN copy', () => {
    const headers = publicWidgetDataHeaders(ID);
    expect(headers['Cache-Control']).toBe('public, max-age=0, must-revalidate');
    expect(headers['Vercel-CDN-Cache-Control']).toBe('public, max-age=86400');
    expect(headers['Vercel-Cache-Tag']).toBe(`widget-${ID}`);
  });

  it('keeps the shared widget script separate from widget data tags', () => {
    expect(WIDGET_SCRIPT_CACHE_HEADERS['Cache-Control']).toBe('public, max-age=0, must-revalidate');
    expect(WIDGET_SCRIPT_CACHE_HEADERS).not.toHaveProperty('Vercel-Cache-Tag');
  });
});

describe('publishWidgetCache', () => {
  it('deduplicates widget tags and makes one purge without HTTP probes', async () => {
    const deleteByTag = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await publishWidgetCache([ID, OTHER_ID, ID, 'invalid'], { deleteByTag }))
        .toEqual({ fresh: true });
      expect(deleteByTag).toHaveBeenCalledTimes(1);
      expect(deleteByTag).toHaveBeenCalledWith([`widget-${ID}`, `widget-${OTHER_ID}`], {
        revalidationDeadlineSeconds: 0,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('retries a failed purge once and warns only if both attempts fail', async () => {
    const failed = vi.fn().mockRejectedValue(new Error('purge down'));
    expect(await publishWidgetCache([ID], { deleteByTag: failed })).toEqual({
      fresh: false,
      liveCacheWarning: LIVE_CACHE_LAG_MESSAGE,
    });
    expect(failed).toHaveBeenCalledTimes(2);

    const recovered = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);
    expect(await publishWidgetCache([ID], { deleteByTag: recovered }))
      .toEqual({ fresh: true });
    expect(recovered).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there are no valid tags', async () => {
    const deleteByTag = vi.fn();
    expect(await publishWidgetCache(['invalid'], { deleteByTag })).toEqual({ fresh: true });
    expect(deleteByTag).not.toHaveBeenCalled();
  });
});
