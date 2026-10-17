import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase-review-image-backfill-store', () => ({
  createSupabaseReviewImageBackfillStore: vi.fn(),
}));
vi.mock('./sync-reviews', () => ({
  syncBusinessReviews: vi.fn(),
}));

import { migrateBusinessReviewImages } from './review-image-migration';
import type { ReviewImageBackfillResult } from './review-image-backfill';

function result(overrides: Partial<ReviewImageBackfillResult> = {}): ReviewImageBackfillResult {
  return {
    businessId: 'business-1',
    businessName: 'Company',
    placeId: 'place-1',
    reviewsScanned: 1,
    candidateReviews: 1,
    candidateImages: 1,
    attemptedImages: 1,
    storedImages: 0,
    failedImages: 1,
    preservedImages: 1,
    updatedReviews: 0,
    remainingGoogleImages: 1,
    failures: [{
      reviewId: 'review-1',
      imageIndex: 0,
      reason: 'Review image source returned HTTP 403',
    }],
    widgetIds: [],
    reviews: [],
    ...overrides,
  };
}

describe('review image migration', () => {
  it('refreshes once after a 403 and retries the remaining Google URLs', async () => {
    const refreshedReviews = [{
      id: 'review-1',
      authorName: 'Reviewer',
      rating: 5,
      text: 'Great',
      relativeTime: 'today',
      images: ['https://project.supabase.co/storage/photo.jpg'],
    }];
    const backfill = vi.fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result({
        candidateImages: 0,
        attemptedImages: 0,
        storedImages: 0,
        failedImages: 0,
        preservedImages: 0,
        remainingGoogleImages: 0,
        failures: [],
        widgetIds: ['widget-after-retry'],
        reviews: refreshedReviews,
      }));
    const refresh = vi.fn(async () => ({
      widgetIds: ['widget-from-refresh'],
      imageStorage: {
        attemptedImages: 5,
        storedImages: 5,
        failedImages: 0,
        preservedImages: 0,
      },
    }));

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith('place-1');
    expect(backfill).toHaveBeenCalledTimes(2);
    expect(migration).toMatchObject({
      refreshTriggered: true,
      complete: true,
      remainingGoogleImages: 0,
      verifiedImages: 1,
      reviews: refreshedReviews,
    });
    expect(migration.widgetIds).toEqual(['widget-from-refresh', 'widget-after-retry']);
  });

  it('does not refresh for failures other than HTTP 403', async () => {
    const backfill = vi.fn(async () => result({
      failures: [{ reviewId: 'review-1', imageIndex: 0, reason: 'timeout' }],
    }));
    const refresh = vi.fn();

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(refresh).not.toHaveBeenCalled();
    expect(migration).toMatchObject({ refreshTriggered: false, complete: false });
  });

  it('reports a refresh failure without losing the preserved original URL', async () => {
    const backfill = vi.fn(async () => result());
    const refresh = vi.fn(async () => { throw new Error('provider unavailable'); });

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(migration).toMatchObject({
      refreshTriggered: true,
      refreshError: 'provider unavailable',
      remainingGoogleImages: 1,
      complete: false,
    });
    expect(backfill).toHaveBeenCalledOnce();
  });
});
