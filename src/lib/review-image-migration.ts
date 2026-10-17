import { backfillBusinessReviewImages, type ReviewImageBackfillResult } from './review-image-backfill';
import { createSupabaseReviewImageBackfillStore } from './supabase-review-image-backfill-store';
import { syncBusinessReviews, type SyncResult } from './sync-reviews';
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
    },
  ) => Promise<Pick<SyncResult, 'widgetIds' | 'imageStorage' | 'imageValidation'>>;
}

function hasForbiddenSource(result: ReviewImageBackfillResult): boolean {
  return result.failures.some((failure) => failure.reason === 'Review image source returned HTTP 403');
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

  if (hasForbiddenSource(first)) {
    refreshTriggered = true;
    try {
      refreshResult = await refresh(first.placeId, 500, {
        // Keep historical photos that a partial provider response merely omits,
        // but remove a URL when Google confirms it is no longer available. This
        // lets deleted reviews remain as text without leaving broken images in
        // the database or any widget cache.
        preserveMissingReviewImages: true,
        preserveUnavailableReviewImages: false,
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

  const complete = final.remainingGoogleImages === 0 && !refreshError;
  // A refresh can re-process photos already stored by the first pass, so raw
  // storage writes may exceed the original candidate count. Derive the result
  // from the original URLs, then separate stored photos from confirmed-dead
  // URLs that the refresh removed.
  const resolvedImages = Math.max(
    0,
    Math.min(first.candidateImages, first.candidateImages - final.remainingGoogleImages),
  );
  const removedUnavailableImages = Math.min(
    resolvedImages,
    refreshResult?.imageValidation.removedImages ?? 0,
  );
  const migratedImages = resolvedImages - removedUnavailableImages;
  return {
    businessId,
    businessName: final.businessName,
    placeId: final.placeId,
    candidateImages: first.candidateImages,
    attemptedImages,
    storedImages: migratedImages,
    verifiedImages: migratedImages,
    removedUnavailableImages,
    failedImages: final.failures.length,
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
