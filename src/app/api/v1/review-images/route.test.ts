import { afterEach, describe, expect, it, vi } from 'vitest';

const { afterCallbacks, supabaseFrom } = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  supabaseFrom: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  },
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

function mockLookup(data: unknown, error: { code?: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const abortSignal = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ abortSignal });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, eq, abortSignal, maybeSingle };
}

function mockLogLookups({
  widget,
  review = null,
  widgetError = null,
  reviewError = null,
}: {
  widget: unknown;
  review?: unknown;
  widgetError?: { code?: string } | null;
  reviewError?: { code?: string } | null;
}) {
  const widgetQuery = mockLookup(widget, widgetError);
  const reviewQuery = mockLookup(review, reviewError);

  supabaseFrom.mockImplementation((table: string) => {
    if (table === 'widgets') return { select: widgetQuery.select };
    if (table === 'reviews') return { select: reviewQuery.select };
    throw new Error(`Unexpected Supabase table: ${table}`);
  });

  return { widgetQuery, reviewQuery };
}

async function flushAfterCallbacks() {
  await Promise.all(afterCallbacks.splice(0).map((callback) => callback()));
}

afterEach(() => {
  afterCallbacks.splice(0);
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
    await flushAfterCallbacks();
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
    const { reviewQuery, widgetQuery } = mockLogLookups({
      widget: {
        id: WIDGET_ID,
        name: 'Acme review carousel',
        widget_type: 'google_reviews_carousel',
        business_id: BUSINESS_ID,
        businesses: { name: 'Acme Auto' },
      },
      review: {
        business_id: BUSINESS_ID,
        google_review_id: REVIEW_ID,
        author_name: 'Taylor Reviewer',
        images: [STORED_GOOGLE_IMAGE],
      },
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
    expect(warning).not.toHaveBeenCalled();
    await flushAfterCallbacks();
    expect(supabaseFrom).toHaveBeenNthCalledWith(1, 'widgets');
    expect(supabaseFrom).toHaveBeenNthCalledWith(2, 'reviews');
    expect(widgetQuery.select).toHaveBeenCalledWith(
      'id, name, widget_type, business_id, businesses(name)'
    );
    expect(widgetQuery.eq).toHaveBeenCalledWith('id', WIDGET_ID);
    expect(reviewQuery.select).toHaveBeenCalledWith(
      'business_id, google_review_id, author_name, images'
    );
    expect(reviewQuery.eq).toHaveBeenCalledWith('google_review_id', REVIEW_ID);
    expect(warning).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        contextStatus: 'verified',
        reviewStatus: 'verified',
        sourceStatus: 'verified',
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

  it('keeps verified widget context when the review ID is absent', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { reviewQuery, widgetQuery } = mockLogLookups({
      widget: {
        id: WIDGET_ID,
        name: 'Acme review badge',
        widget_type: 'google_reviews',
        business_id: BUSINESS_ID,
        businesses: { name: 'Acme Auto' },
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>denied</html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    })));

    const response = await GET(
      new Request(
        `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}&widgetId=${WIDGET_ID}`
      )
    );

    expect(response.status).toBe(404);
    await flushAfterCallbacks();
    expect(widgetQuery.select).toHaveBeenCalled();
    expect(reviewQuery.select).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        contextStatus: 'widget_verified',
        reviewStatus: 'not_provided',
        sourceStatus: 'not_checked',
        widgetId: WIDGET_ID,
        widgetName: 'Acme review badge',
        widgetSurface: 'badge',
        businessName: 'Acme Auto',
      })
    );
  });

  it('keeps verified widget context when an untrusted review ID is invalid', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { reviewQuery, widgetQuery } = mockLogLookups({
      widget: {
        id: WIDGET_ID,
        name: 'Acme review badge',
        widget_type: 'google_reviews',
        business_id: BUSINESS_ID,
        businesses: { name: 'Acme Auto' },
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>denied</html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    })));

    const response = await GET(
      new Request(
        `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}&widgetId=${WIDGET_ID}&reviewId=${encodeURIComponent('invalid\nreview')}`
      )
    );

    expect(response.status).toBe(404);
    await flushAfterCallbacks();
    expect(widgetQuery.select).toHaveBeenCalled();
    expect(reviewQuery.select).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        contextStatus: 'widget_verified',
        reviewStatus: 'invalid',
        sourceStatus: 'not_checked',
        widgetId: WIDGET_ID,
        widgetName: 'Acme review badge',
      })
    );
  });

  it('does not attach review details when the review belongs to a different business', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockLogLookups({
      widget: {
        id: WIDGET_ID,
        name: 'Acme review carousel',
        widget_type: 'google_reviews_carousel',
        business_id: BUSINESS_ID,
        businesses: { name: 'Acme Auto' },
      },
      review: {
        business_id: '4f3a9c2e-4b1d-4e8f-9a6c-2d5e8f1a3b7c',
        google_review_id: REVIEW_ID,
        author_name: 'Another Customer',
        images: [STORED_GOOGLE_IMAGE],
      },
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
    await flushAfterCallbacks();
    const logContext = warning.mock.calls[0][1];
    expect(logContext).toEqual(expect.objectContaining({
      contextStatus: 'widget_verified',
      reviewStatus: 'business_mismatch',
      sourceStatus: 'not_checked',
      widgetId: WIDGET_ID,
      businessId: BUSINESS_ID,
    }));
    expect(logContext).not.toHaveProperty('reviewId');
    expect(logContext).not.toHaveProperty('reviewAuthorName');
  });

  it('records review context when its source does not match the requested image', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockLogLookups({
      widget: {
        id: WIDGET_ID,
        name: 'Acme review carousel',
        widget_type: 'google_reviews_carousel',
        business_id: BUSINESS_ID,
        businesses: { name: 'Acme Auto' },
      },
      review: {
        business_id: BUSINESS_ID,
        google_review_id: REVIEW_ID,
        author_name: 'Taylor Reviewer',
        images: ['https://lh3.googleusercontent.com/grass-cs/different=s0'],
      },
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
    await flushAfterCallbacks();
    expect(warning).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        contextStatus: 'review_verified',
        reviewStatus: 'verified',
        sourceStatus: 'mismatch',
        widgetId: WIDGET_ID,
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
    await flushAfterCallbacks();
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
    await flushAfterCallbacks();
    expect(log).toHaveBeenCalledWith(
      '[review-image-proxy]',
      expect.objectContaining({
        event: 'review_image_proxy.invalid_upstream_response',
        upstreamStatus: 200,
        upstreamContentType: 'text/html',
      })
    );
  });

  it('limits a single client after 120 valid proxy requests in one minute', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('image-bytes', {
      headers: { 'Content-Type': 'image/jpeg' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const requestUrl =
      `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`;
    const requestHeaders = { 'x-forwarded-for': '198.51.100.42' };

    for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
      const response = await GET(new Request(requestUrl, { headers: requestHeaders }));
      expect(response.status).toBe(200);
    }

    const limited = await GET(new Request(requestUrl, { headers: requestHeaders }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(fetchMock).toHaveBeenCalledTimes(120);
  });
});
