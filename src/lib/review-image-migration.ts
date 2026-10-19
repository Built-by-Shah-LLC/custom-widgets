import { backfillBusinessReviewImages, type ReviewImageBackfillResult } from './review-image-backfill';
import { createSupabaseReviewImageBackfillStore } from './supabase-review-image-backfill-store';
import { syncBusinessReviews, type SyncResult } from './sync-reviews';
import type { ScrapeDoReviewSort } from './scrapedo';
import type { ApiReview } from './widget-mappers';

export interface ReviewImageMigrationResult {
  businessId: string;
  businessName: string;
  placeId: string;
  candidateImages: number;
  attemptedImages: number;
  storedImages: number;
  verifiedImages: number;
  removedUnavailableImages: number;
  failedImages: number;
  remainingGoogleImages: number;
  updatedReviews: number;
  refreshTriggered: boolean;
  refreshError?: string;
  complete: boolean;
  failures: ReviewImageBackfillResult['failures'];
  widgetIds: string[];
  reviews: ApiReview[];
}

interface MigrationDependencies {
  backfill?: (businessId: string) => Promise<ReviewImageBackfillResult>;
  refresh?: (
    placeId: string,
    maxReviews: number,
    options: {
      preserveMissingReviewImages: boolean;
      preserveUnavailableReviewImages: boolean;
      sortBy?: ScrapeDoReviewSort;
    },
  ) => Promise<Pick<SyncResult, 'widgetIds' | 'imageStorage' | 'imageValidation'>>;
}

function hasForbiddenSource(result: ReviewImageBackfillResult): boolean {
  return result.failures.some((failure) => failure.reason === 'Review image source returned HTTP 403');
}

function hasStoredReviewImages(result: ReviewImageBackfillResult): boolean {
  return result.reviews.some((review) => (review.images?.length ?? 0) > 0);
}

export async function migrateBusinessReviewImages(
  businessId: string,
  dependencies: MigrationDependencies = {},
): Promise<ReviewImageMigrationResult> {
  const backfill = dependencies.backfill
    ?? ((id: string) => backfillBusinessReviewImages(createSupabaseReviewImageBackfillStore(), id));
  const refresh = dependencies.refresh ?? syncBusinessReviews;

  const first = await backfill(businessId);
  let final = first;
  let refreshResult: Pick<SyncResult, 'widgetIds' | 'imageStorage' | 'imageValidation'> | undefined;
  let refreshTriggered = false;
  let refreshError: string | undefined;
  let attemptedImages = first.attemptedImages;
  let updatedReviews = first.updatedReviews;
  const widgetIds = new Set(first.widgetIds);
  const forbiddenSource = hasForbiddenSource(first);
  const imageDiscoveryNeeded = first.candidateImages === 0 && !hasStoredReviewImages(first);

  if (forbiddenSource || imageDiscoveryNeeded) {
    refreshTriggered = true;
    try {
      refreshResult = await refresh(first.placeId, 500, {
        // Keep historical photos that a partial provider response merely omits,
        // but remove a URL when Google confirms it is no longer available. This
        // lets deleted reviews remain as text without leaving broken images in
        // the database or any widget cache.
        preserveMissingReviewImages: true,
        preserveUnavailableReviewImages: false,
        sortBy: forbiddenSource ? 'newest' : 'relevance',
      });
      refreshResult.widgetIds.forEach((id) => widgetIds.add(id));
      attemptedImages += refreshResult.imageStorage.attemptedImages;

      final = await backfill(businessId);
      final.widgetIds.forEach((id) => widgetIds.add(id));
      attemptedImages += final.attemptedImages;
      updatedReviews += final.updatedReviews;
    } catch (error) {
      refreshError = error instanceof Error ? error.message : 'Review refresh failed';
    }
  }

  const discoveredFailedImages = imageDiscoveryNeeded
    ? refreshResult?.imageStorage.failedImages ?? 0
    : 0;
  const complete = final.remainingGoogleImages === 0
    && discoveredFailedImages === 0
    && !refreshError;
  // A refresh can re-process photos already stored by the first pass, so raw
  // storage writes may exceed the original candidate count. Derive the result
  // for existing URLs from their final state, while counting a discovery pass
  // directly from its storage diagnostics because failed brand-new URLs are
  // intentionally omitted instead of persisted.
  const discoveredImages = imageDiscoveryNeeded
    ? refreshResult?.imageStorage.attemptedImages ?? 0
    : 0;
  const candidateImages = first.candidateImages + discoveredImages;
  const resolvedExistingImages = Math.max(
    0,
    Math.min(first.candidateImages, first.candidateImages - final.remainingGoogleImages),
  );
  const removedUnavailableImages = Math.min(
    resolvedExistingImages,
    refreshResult?.imageValidation.removedImages ?? 0,
  );
  const migratedExistingImages = resolvedExistingImages - removedUnavailableImages;
  const migratedImages = migratedExistingImages + (
    imageDiscoveryNeeded ? refreshResult?.imageStorage.storedImages ?? 0 : 0
  );
  return {
    businessId,
    businessName: final.businessName,
    placeId: final.placeId,
    candidateImages,
    attemptedImages,
    storedImages: migratedImages,
    verifiedImages: migratedImages,
    removedUnavailableImages,
    failedImages: final.failures.length + discoveredFailedImages,
    remainingGoogleImages: final.remainingGoogleImages,
    updatedReviews,
    refreshTriggered,
    ...(refreshError ? { refreshError } : {}),
    complete,
    failures: final.failures,
    widgetIds: Array.from(widgetIds),
    reviews: final.reviews,
  };
}
