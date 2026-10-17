import { describe, expect, it, vi } from 'vitest';
import {
  backfillBusinessReviewImages,
  replaceWidgetCachedReviewImages,
  type HistoricalReviewRow,
  type ReviewImageBackfillStore,
} from './review-image-backfill';

const googleImage = (id: string) => `https://lh3.googleusercontent.com/review/${id}=w800-h600`;
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function row(id: string, images: string[]): HistoricalReviewRow {
  return {
    id: `row-${id}`,
    business_id: 'business-1',
    google_review_id: id,
    author_name: 'Reviewer',
    rating: 5,
    text: 'Great',
    relative_time: 'a week ago',
    images,
  };
}

describe('review image backfill', () => {
  it('replaces only matching cached review image arrays and preserves other fields', () => {
    const cached = [
      { id: 'review-1', text: 'keep me', images: [googleImage('one')] },
      { id: 'review-2', images: ['https://storage.example/unchanged.jpg'] },
    ];

    const result = replaceWidgetCachedReviewImages(cached, [{
      id: 'review-1',
      authorName: 'Reviewer',
      rating: 5,
      text: 'new text is intentionally ignored',
      relativeTime: 'now',
      images: ['https://project.supabase.co/storage/photo.jpg'],
    }]);

    expect(result.changed).toBe(true);
    expect(result.cachedReviews).toEqual([
      { id: 'review-1', text: 'keep me', images: ['https://project.supabase.co/storage/photo.jpg'] },
      cached[1],
    ]);
  });

  it('updates successful images and preserves a Google URL that returns 403', async () => {
    const first = googleImage('available');
    const second = googleImage('forbidden');
    const reviews = [row('review-1', [first, second])];
    const updateReviewImages = vi.fn(async ({ reviewRowId, images }) => {
      const review = reviews.find((value) => value.id === reviewRowId);
      if (review) review.images = images;
    });
    const updateWidgetCaches = vi.fn(async () => ['widget-1']);
    const store: ReviewImageBackfillStore = {
      getBusiness: vi.fn(async () => ({ id: 'business-1', name: 'Company', place_id: 'place-1' })),
      listReviews: vi.fn(async () => reviews),
      uploadReviewImage: vi.fn(async ({ path }) =>
        `https://project.supabase.co/storage/v1/object/public/review-images/${path}`
      ),
      updateReviewImages,
      updateWidgetCaches,
    };

    const result = await backfillBusinessReviewImages(store, 'business-1', {
      concurrency: 1,
      fetchImpl: vi.fn(async (input) => String(input).includes('forbidden')
        ? new Response('Forbidden', { status: 403 })
        : new Response(jpegBytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })),
    });

    expect(updateReviewImages).toHaveBeenCalledTimes(1);
    expect(reviews[0].images?.[0]).toContain('/review-images/business-1/');
    expect(reviews[0].images?.[1]).toBe(second);
    expect(result).toMatchObject({
      candidateImages: 2,
      attemptedImages: 2,
      storedImages: 1,
      failedImages: 1,
      preservedImages: 1,
      updatedReviews: 1,
      remainingGoogleImages: 1,
      widgetIds: ['widget-1'],
    });
    expect(result.failures).toEqual([{
      reviewId: 'review-1',
      imageIndex: 1,
      reason: 'Review image source returned HTTP 403',
    }]);
    expect(updateWidgetCaches).toHaveBeenCalledTimes(1);
  });
});
