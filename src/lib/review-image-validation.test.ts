import { describe, expect, it, vi } from 'vitest';
import { removeUnavailableReviewImages } from './review-image-validation';

const googleImage = (id: string) => `https://lh3.googleusercontent.com/grass-cs/${id}=k-no`;

describe('review image validation', () => {
  it('removes confirmed unavailable and non-image Google URLs', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('forbidden')) return new Response('Forbidden', { status: 403 });
      if (url.includes('html')) {
        return new Response('<html />', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('x', {
        status: 206,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    });
    const valid = googleImage('valid');
    const forbidden = googleImage('forbidden');
    const html = googleImage('html');
    const result = await removeUnavailableReviewImages([
      { id: 'a', images: [valid, forbidden] },
      { id: 'b', images: [html] },
      { id: 'c', images: [forbidden] },
    ], { fetchImpl, timeoutMs: 50, concurrency: 2 });

    expect(result.reviews).toEqual([
      { id: 'a', images: [valid] },
      { id: 'b', images: [] },
      { id: 'c', images: [] },
    ]);
    expect(result.checkedImages).toBe(3);
    expect(result.removedImages).toBe(3);
    expect(result.changedReviews.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('keeps URLs on transient failures and leaves non-Google URLs untouched', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('throws')) throw new Error('temporary network failure');
      return new Response('temporary', { status: 503 });
    });
    const transient = googleImage('transient');
    const throws = googleImage('throws');
    const external = 'https://images.example.com/review.jpg';
    const reviews = [{ id: 'a', images: [transient, throws, external] }];
    const result = await removeUnavailableReviewImages(reviews, {
      fetchImpl,
      timeoutMs: 50,
    });

    expect(result.reviews).toEqual(reviews);
    expect(result.changedReviews).toEqual([]);
    expect(result.removedImages).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
