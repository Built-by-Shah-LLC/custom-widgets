import { afterEach, describe, expect, it, vi } from 'vitest';

const { supabaseFrom } = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabase: { from: supabaseFrom },
}));

import { GET } from './route';

const GOOGLE_IMAGE =
  'https://lh3.googleusercontent.com/grass-cs/example=w120-h120-c';
const STORED_GOOGLE_IMAGE =
  'https://lh3.googleusercontent.com/grass-cs/example=s0';
const WIDGET_ID = '7f3a9c2e-4b1d-4e8f-9a6c-2d5e8f1a3b7c';
const BUSINESS_ID = '3f3a9c2e-4b1d-4e8f-9a6c-2d5e8f1a3b7c';
const REVIEW_ID = 'google-review-123';

function mockWidgetLookup(data: unknown, error: { code?: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const abortSignal = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ abortSignal });
  const select = vi.fn().mockReturnValue({ eq });
  supabaseFrom.mockReturnValue({ select });
  return { select, eq, abortSignal, maybeSingle };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  supabaseFrom.mockReset();
});

describe('review image proxy', () => {
  it('rejects arbitrary remote URLs without fetching them', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new Request('https://widgets.example.com/api/v1/review-images?url=https%3A%2F%2Fevil.test%2Fimage.jpg')
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streams valid images with public cache headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('image-bytes', {
      headers: { 'Content-Type': 'image/jpeg', ETag: 'test-etag' },
    })));

    const response = await GET(
      new Request(`https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toContain('s-maxage=604800');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toBe('image-bytes');
  });

  it('marks a forbidden Google image as unavailable and caches that result briefly', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>denied</html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    })));

    const response = await GET(
      new Request(`https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`, {
        headers: { 'x-vercel-id': 'sfo1::test-request' },
      })
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(warning).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        event: 'review_image_proxy.source_unavailable',
        vercelRequestId: 'sfo1::test-request',
        upstreamStatus: 403,
        upstreamContentType: 'text/html',
        sourceHost: 'lh3.googleusercontent.com',
      })
    );
  });

  it('logs verified widget, surface, business, and review context for an unavailable image', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const query = mockWidgetLookup({
      id: WIDGET_ID,
      name: 'Acme review carousel',
      widget_type: 'google_reviews_carousel',
      business_id: BUSINESS_ID,
      businesses: { name: 'Acme Auto' },
      cached_reviews: [{
        id: REVIEW_ID,
        authorName: 'Taylor Reviewer',
        images: [STORED_GOOGLE_IMAGE],
      }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>denied</html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    })));

    const response = await GET(
      new Request(
        `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}&widgetId=${WIDGET_ID}&reviewId=${REVIEW_ID}`
      )
    );

    expect(response.status).toBe(404);
    expect(supabaseFrom).toHaveBeenCalledWith('widgets');
    expect(query.select).toHaveBeenCalledWith(
      'id, name, widget_type, business_id, cached_reviews, businesses(name)'
    );
    expect(query.eq).toHaveBeenCalledWith('id', WIDGET_ID);
    expect(warning).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        contextStatus: 'verified',
        widgetId: WIDGET_ID,
        widgetName: 'Acme review carousel',
        widgetType: 'google_reviews_carousel',
        widgetSurface: 'carousel',
        businessId: BUSINESS_ID,
        businessName: 'Acme Auto',
        reviewId: REVIEW_ID,
        reviewAuthorName: 'Taylor Reviewer',
      })
    );
  });

  it('logs a safe, request-correlated diagnostic when the upstream fetch throws', async () => {
    const error = new TypeError(`fetch failed for ${GOOGLE_IMAGE}`, {
      cause: Object.assign(new Error(`connect timeout for ${GOOGLE_IMAGE}`), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));

    const response = await GET(
      new Request(`https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`, {
        headers: { 'x-vercel-id': 'iad1::test-request' },
      })
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(log).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        event: 'review_image_proxy.upstream_fetch_failed',
        vercelRequestId: 'iad1::test-request',
        sourceHost: 'lh3.googleusercontent.com',
        error: expect.objectContaining({
          name: 'TypeError',
          message: 'fetch failed for <url>',
          cause: expect.objectContaining({ code: 'UND_ERR_CONNECT_TIMEOUT' }),
        }),
      })
    );

    const logContext = log.mock.calls[0][1];
    expect(JSON.stringify(logContext)).not.toContain(GOOGLE_IMAGE);
  });

  it('keeps malformed upstream content as a gateway error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>blocked</html>', {
      headers: { 'Content-Type': 'text/html' },
    })));

    const response = await GET(
      new Request(`https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`)
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(log).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        event: 'review_image_proxy.invalid_upstream_response',
        upstreamStatus: 200,
        upstreamContentType: 'text/html',
      })
    );
  });
});
