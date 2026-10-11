import { describe, expect, it, vi } from 'vitest';
import { mirrorRefreshedReviewImages } from './review-image-storage';

const googleImage = (id: string) => `https://lh3.googleusercontent.com/grass-cs/${id}=k-no`;
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function jpegResponse(headers: Record<string, string> = {}) {
  return new Response(new Blob([jpegBytes]), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', ...headers },
  });
}

describe('review image storage', () => {
  it('downloads once, stores immutable versioned objects, and returns public URLs', async () => {
    const source = googleImage('shared-photo');
    const fetchImpl = vi.fn<typeof fetch>(async () => jpegResponse());
    const upload = vi.fn(async ({ path }: { path: string }) =>
      `https://project.supabase.co/storage/v1/object/public/review-images/${path}`
    );

    const result = await mirrorRefreshedReviewImages(
      'business-1',
      [
        { reviewId: 'review-a', images: [source] },
        { reviewId: 'review-b', images: [source] },
      ],
      { fetchImpl, upload, concurrency: 2 },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0]).toMatchObject({
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    });
    expect(upload.mock.calls[0][0].path).toMatch(
      /^business-1\/[a-f0-9]{32}\/0-[a-f0-9]{32}\.jpg$/,
    );
    expect(result.reviews[0].images[0]).toContain('/review-images/business-1/');
    expect(result).toMatchObject({
      attemptedImages: 2,
      storedImages: 2,
      failedImages: 0,
      preservedImages: 0,
    });
  });

  it('preserves same-index existing images when download or upload fails', async () => {
    const forbidden = googleImage('forbidden');
    const uploadFailure = googleImage('upload-failure');
    const unsupported = 'https://images.example.com/review.jpg';
    const previous = [
      'https://storage.example.com/previous-0.jpg',
      'https://storage.example.com/previous-1.jpg',
      'https://storage.example.com/previous-2.jpg',
    ];
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('forbidden')
        ? new Response('Forbidden', { status: 403 })
        : jpegResponse()
    );
    const upload = vi.fn(async () => {
      throw new Error('temporary storage failure');
    });

    const result = await mirrorRefreshedReviewImages(
      'business-1',
      [{ reviewId: 'review-a', images: [forbidden, uploadFailure, unsupported], previousImages: previous }],
      { fetchImpl, upload },
    );

    expect(result.reviews).toEqual([{ reviewId: 'review-a', images: previous }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      attemptedImages: 3,
      storedImages: 0,
      failedImages: 3,
      preservedImages: 3,
    });
  });

  it('omits failed brand-new images instead of persisting an expiring source URL', async () => {
    const source = googleImage('forbidden');
    const result = await mirrorRefreshedReviewImages(
      'business-1',
      [{ reviewId: 'review-a', images: [source] }],
      {
        fetchImpl: vi.fn(async () => new Response('Forbidden', { status: 403 })),
        upload: vi.fn(),
      },
    );

    expect(result.reviews).toEqual([{ reviewId: 'review-a', images: [] }]);
    expect(result.failedImages).toBe(1);
    expect(result.preservedImages).toBe(0);
  });

  it('rejects oversized files and bytes that do not match their declared type', async () => {
    const oversized = googleImage('oversized');
    const spoofed = googleImage('spoofed');
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('oversized')) {
        return jpegResponse({ 'Content-Length': '100' });
      }
      return new Response('<html>not an image</html>', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    });
    const upload = vi.fn();

    const result = await mirrorRefreshedReviewImages(
      'business-1',
      [{ reviewId: 'review-a', images: [oversized, spoofed] }],
      { fetchImpl, upload, maxBytes: 20 },
    );

    expect(result.reviews[0].images).toEqual([]);
    expect(result.failedImages).toBe(2);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects redirects so the downloader cannot follow an allowlisted URL to another host', async () => {
    const result = await mirrorRefreshedReviewImages(
      'business-1',
      [{ reviewId: 'review-a', images: [googleImage('redirect')] }],
      {
        fetchImpl: vi.fn(async () => new Response(null, {
          status: 302,
          headers: { Location: 'https://evil.example/image.jpg' },
        })),
        upload: vi.fn(),
      },
    );

    expect(result.reviews[0].images).toEqual([]);
    expect(result.failedImages).toBe(1);
  });

  it('bounds the total bytes attempted during one refresh', async () => {
    const previous = 'https://storage.example.com/previous.jpg';
    const upload = vi.fn(async ({ path }: { path: string }) =>
      `https://project.supabase.co/storage/v1/object/public/review-images/${path}`
    );
    const result = await mirrorRefreshedReviewImages(
      'business-1',
      [{
        reviewId: 'review-a',
        images: [googleImage('one'), googleImage('two')],
        previousImages: ['', previous],
      }],
      {
        fetchImpl: vi.fn(async () => jpegResponse()),
        upload,
        concurrency: 1,
        maxTotalBytes: jpegBytes.byteLength,
      },
    );

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.reviews[0].images).toHaveLength(2);
    expect(result.reviews[0].images[1]).toBe(previous);
    expect(result).toMatchObject({
      storedImages: 1,
      failedImages: 1,
      preservedImages: 1,
    });
  });
});
