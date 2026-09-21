import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const GOOGLE_IMAGE =
  'https://lh3.googleusercontent.com/grass-cs/example=w120-h120-c';

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('does not forward an upstream HTML error as an image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>denied</html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    })));

    const response = await GET(
      new Request(`https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`)
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
