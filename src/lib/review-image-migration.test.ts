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
      imageValidation: {
        checkedImages: 0,
        removedImages: 0,
        changedReviews: 0,
      },
    }));

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith('place-1', 500, {
      preserveMissingReviewImages: true,
      preserveUnavailableReviewImages: false,
      sortBy: 'newest',
    });
    expect(backfill).toHaveBeenCalledTimes(2);
    expect(migration).toMatchObject({
      refreshTriggered: true,
      complete: true,
      remainingGoogleImages: 0,
      verifiedImages: 1,
      removedUnavailableImages: 0,
      reviews: refreshedReviews,
    });
    expect(migration.widgetIds).toEqual(['widget-from-refresh', 'widget-after-retry']);
  });

  it('removes a confirmed-dead URL when the review no longer has a recoverable photo', async () => {
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
      }));
    const refresh = vi.fn(async () => ({
      widgetIds: ['widget-after-cleanup'],
      imageStorage: {
        attemptedImages: 0,
        storedImages: 0,
        failedImages: 0,
        preservedImages: 0,
      },
      imageValidation: {
        checkedImages: 1,
        removedImages: 1,
        changedReviews: 1,
      },
    }));

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(migration).toMatchObject({
      refreshTriggered: true,
      complete: true,
      storedImages: 0,
      verifiedImages: 0,
      removedUnavailableImages: 1,
      remainingGoogleImages: 0,
    });
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

  it('discovers photo reviews by relevance when the stored company has no review images', async () => {
    const discoveredReviews = [{
      id: 'review-with-photo',
      authorName: 'Photo Reviewer',
      rating: 5,
      text: 'See photo',
      relativeTime: 'today',
      images: ['https://project.supabase.co/storage/photo.jpg'],
    }];
    const empty = result({
      candidateReviews: 0,
      candidateImages: 0,
      attemptedImages: 0,
      failedImages: 0,
      preservedImages: 0,
      remainingGoogleImages: 0,
      failures: [],
      reviews: [],
    });
    const backfill = vi.fn()
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(result({
        candidateReviews: 0,
        candidateImages: 0,
        attemptedImages: 0,
        storedImages: 0,
        failedImages: 0,
        preservedImages: 0,
        remainingGoogleImages: 0,
        failures: [],
        reviews: discoveredReviews,
      }));
    const refresh = vi.fn(async () => ({
      widgetIds: ['widget-with-discovered-photo'],
      imageStorage: {
        attemptedImages: 1,
        storedImages: 1,
        failedImages: 0,
        preservedImages: 0,
      },
      imageValidation: {
        checkedImages: 0,
        removedImages: 0,
        changedReviews: 0,
      },
    }));

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(refresh).toHaveBeenCalledWith('place-1', 500, {
      preserveMissingReviewImages: true,
      preserveUnavailableReviewImages: false,
      sortBy: 'relevance',
    });
    expect(migration).toMatchObject({
      refreshTriggered: true,
      candidateImages: 1,
      storedImages: 1,
      verifiedImages: 1,
      complete: true,
      reviews: discoveredReviews,
    });
  });

  it('does not rediscover or redownload when stored review photos already use Supabase', async () => {
    const backfill = vi.fn(async () => result({
      candidateReviews: 0,
      candidateImages: 0,
      attemptedImages: 0,
      storedImages: 0,
      failedImages: 0,
      preservedImages: 0,
      remainingGoogleImages: 0,
      failures: [],
      reviews: [{
        id: 'review-1',
        authorName: 'Reviewer',
        rating: 5,
        text: 'Great',
        relativeTime: 'today',
        images: ['https://project.supabase.co/storage/photo.jpg'],
      }],
    }));
    const refresh = vi.fn();

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(refresh).not.toHaveBeenCalled();
    expect(migration).toMatchObject({
      refreshTriggered: false,
      candidateImages: 0,
      storedImages: 0,
      complete: true,
    });
  });

  it('does not report a failed discovered photo as stored', async () => {
    const empty = result({
      candidateReviews: 0,
      candidateImages: 0,
      attemptedImages: 0,
      failedImages: 0,
      preservedImages: 0,
      remainingGoogleImages: 0,
      failures: [],
      reviews: [],
    });
    const backfill = vi.fn().mockResolvedValue(empty);
    const refresh = vi.fn(async () => ({
      widgetIds: [],
      imageStorage: {
        attemptedImages: 1,
        storedImages: 0,
        failedImages: 1,
        preservedImages: 0,
      },
      imageValidation: {
        checkedImages: 0,
        removedImages: 0,
        changedReviews: 0,
      },
    }));

    const migration = await migrateBusinessReviewImages('business-1', { backfill, refresh });

    expect(migration).toMatchObject({
      candidateImages: 1,
      storedImages: 0,
      verifiedImages: 0,
      failedImages: 1,
      complete: false,
    });
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
