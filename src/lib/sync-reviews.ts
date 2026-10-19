import {
  fetchAllScrapeDoReviews,
  type ScrapeDoPageDiagnostic,
  type ScrapeDoReview,
  type ScrapeDoReviewSort,
  type ScrapeDoReviewsResult,
} from './scrapedo';
import { supabase } from './db';
import { mapReviewRow, type ApiReview } from './widget-mappers';
import { removeUnavailableReviewImages } from './review-image-validation';
import {
  mirrorRefreshedReviewImages,
} from './review-image-storage';
import { uploadVerifiedReviewImage } from './verified-review-image-upload';

export interface SyncResult {
  businessId: string;
  businessName: string;
  placeId: string;
  pagesFetched: number;
  reviewsStored: number;
  totalReviews: number | null;
  averageRating: number | null;
  widgetsUpdated: number;
  widgetIds: string[];
  reviewsFetched: number;
  targetReviews: number;
  complete: boolean;
  stopReason: string;
  requestsMade: number;
  pageDiagnostics: Array<ScrapeDoPageDiagnostic & { sortBy: ScrapeDoReviewSort }>;
  reviews: ApiReview[];
  syncedAt: string;
  imageValidation: {
    checkedImages: number;
    removedImages: number;
    changedReviews: number;
  };
  imageStorage: {
    attemptedImages: number;
    storedImages: number;
    failedImages: number;
    preservedImages: number;
  };
}

function reviewIdentity(businessId: string, review: ScrapeDoReview) {
  return review.review_id
    ?? `${businessId}|${review.user?.name ?? 'anon'}|${review.date ?? ''}|${(review.snippet ?? '').slice(0, 40)}`;
}

function withSortDiagnostics(
  result: ScrapeDoReviewsResult,
  sortBy: ScrapeDoReviewSort,
  pageOffset = 0,
): Array<ScrapeDoPageDiagnostic & { sortBy: ScrapeDoReviewSort }> {
  return result.pageDiagnostics.map((diagnostic) => ({
    ...diagnostic,
    page: diagnostic.page + pageOffset,
    sortBy,
  }));
}

async function fetchReviewsForSync(
  business: {
    id: string;
    scrapedo_data_id: string | null;
    total_reviews: number | null;
  },
  placeId: string,
  token: string,
  maxReviews: number,
  requestedSort: ScrapeDoReviewSort,
): Promise<Omit<ScrapeDoReviewsResult, 'pageDiagnostics'> & {
  pageDiagnostics: Array<ScrapeDoPageDiagnostic & { sortBy: ScrapeDoReviewSort }>;
}> {
  const fetchOptions = {
    dataId: business.scrapedo_data_id,
    expectedReviewCount: business.total_reviews,
  };
  const primary = await fetchAllScrapeDoReviews(
    placeId,
    token,
    maxReviews,
    requestedSort,
    fetchOptions,
  );
  const primaryDiagnostics = withSortDiagnostics(primary, requestedSort);

  // A normal refresh is newest-first, but some Google Maps responses expose
  // only a small unpaged subset for that sort. A relevance pass can contain
  // older photo reviews that are absent from the newest subset. Merge it only
  // when the provider itself reports that the newest pass missed its target.
  if (requestedSort !== 'newest' || primary.complete) {
    return { ...primary, pageDiagnostics: primaryDiagnostics };
  }

  try {
    const relevance = await fetchAllScrapeDoReviews(
      placeId,
      token,
      maxReviews,
      'relevance',
      {
        ...fetchOptions,
        dataId: primary.dataId ?? fetchOptions.dataId,
      },
    );
    const merged = new Map<string, ScrapeDoReview>();
    for (const review of primary.reviews) {
      merged.set(reviewIdentity(business.id, review), review);
    }
    // Let the relevance representation win for duplicate IDs because it can
    // include photo URLs omitted by the newest representation. Preserve the
    // union of both image lists so a sparser representation cannot remove a
    // photo discovered by the other sort.
    for (const review of relevance.reviews) {
      const identity = reviewIdentity(business.id, review);
      const previous = merged.get(identity);
      merged.set(identity, previous
        ? {
            ...previous,
            ...review,
            images: Array.from(new Set([
              ...(previous.images ?? []),
              ...(review.images ?? []),
            ])),
          }
        : review);
    }

    const reviews = Array.from(merged.values()).slice(0, maxReviews);
    const complete = reviews.length >= primary.targetReviews;
    return {
      reviews,
      place_info: primary.place_info ?? relevance.place_info,
      dataId: primary.dataId ?? relevance.dataId,
      fetchedPages: primary.fetchedPages + relevance.fetchedPages,
      requestsMade: primary.requestsMade + relevance.requestsMade,
      targetReviews: primary.targetReviews,
      complete,
      stopReason: complete ? 'target_reached' : primary.stopReason,
      pageDiagnostics: [
        ...primaryDiagnostics,
        ...withSortDiagnostics(relevance, 'relevance', primary.fetchedPages),
      ],
    };
  } catch (error) {
    // Keep the successful newest result usable if the supplemental request is
    // transiently unavailable; the sync remains partial and can be retried.
    console.warn('[reviews-sync] Relevance fallback failed', {
      businessId: business.id,
      placeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...primary, pageDiagnostics: primaryDiagnostics };
  }
}

/**
 * Fetches reviews from Scrape.do and stores them in Supabase.
 *
 * This is the ONLY place Scrape.do is called. The app (editor, embed script,
 * reviews endpoint) always reads from Supabase; refresh cadence is a
 * separate decision (manual trigger now, cron later).
 */
export async function syncBusinessReviews(
  placeId: string,
  maxReviews = 40,
  options: {
    preserveMissingReviewImages?: boolean;
    preserveUnavailableReviewImages?: boolean;
    sortBy?: ScrapeDoReviewSort;
  } = {},
): Promise<SyncResult> {
  const token = process.env.SCRAPEDO_TOKEN;
  if (!token) throw new Error('SCRAPEDO_TOKEN not configured');

  // 1. Resolve the managed business
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, name, place_id, scrapedo_data_id, total_reviews, average_rating')
    .eq('place_id', placeId)
    .single();

  if (businessError || !business) {
    throw new Error(`No managed business found for place_id ${placeId}`);
  }

  // 2. Fetch from Scrape.do (paginated, up to 20 reviews per request).
  // Normal refreshes are newest-first. Targeted image discovery can request a
  // relevance pass because providers sometimes expose only a small, unpaged
  // subset and that subset can contain photo reviews absent from `newest`.
  const requestedSort = options.sortBy ?? 'newest';
  const {
    reviews,
    place_info,
    dataId,
    fetchedPages,
    requestsMade,
    targetReviews,
    complete,
    stopReason,
    pageDiagnostics,
  } = await fetchReviewsForSync(
    business,
    placeId,
    token,
    maxReviews,
    requestedSort,
  );

  console.info('[reviews-sync] Scrape.do pagination completed', {
    businessId: business.id,
    placeId,
    targetReviews,
    reviewsFetched: reviews.length,
    fetchedPages,
    requestsMade,
    complete,
    stopReason,
    sortsFetched: Array.from(new Set(pageDiagnostics.map((page) => page.sortBy))),
    pageDiagnostics,
  });

  // 3. Upsert the fetched page. Never delete the existing snapshot: review IDs
  // are stable, so refreshes update known rows and insert only new ones.
  const deduped = new Map(
    reviews.map((r) => [
      reviewIdentity(business.id, r),
      r,
    ])
  );

  const fetchedReviewIds = Array.from(deduped.keys());
  const { data: existingFetchedRows, error: existingFetchedRowsError } = fetchedReviewIds.length > 0
    ? await supabase
      .from('reviews')
      .select('google_review_id, images')
      .eq('business_id', business.id)
      .in('google_review_id', fetchedReviewIds)
    : { data: [], error: null };
  if (existingFetchedRowsError) {
    throw new Error(`Existing review image read failed: ${existingFetchedRowsError.message}`);
  }

  const previousImagesByReviewId = new Map(
    (existingFetchedRows ?? []).map((row) => [
      row.google_review_id as string,
      Array.isArray(row.images) ? row.images as string[] : [],
    ]),
  );
  const imageStorage = await mirrorRefreshedReviewImages(
    business.id,
    Array.from(deduped.entries()).map(([reviewId, review]) => ({
      reviewId,
      images: review.images ?? [],
      previousImages: previousImagesByReviewId.get(reviewId) ?? [],
    })),
    {
      upload: uploadVerifiedReviewImage,
      preserveMissingPreviousImages: options.preserveMissingReviewImages,
    },
  );
  const storedImagesByReviewId = new Map(
    imageStorage.reviews.map((review) => [review.reviewId, review.images]),
  );

  console.info('[reviews-sync] Refreshed review images stored', {
    businessId: business.id,
    attemptedImages: imageStorage.attemptedImages,
    storedImages: imageStorage.storedImages,
    failedImages: imageStorage.failedImages,
    preservedImages: imageStorage.preservedImages,
  });

  const rows = Array.from(deduped.entries()).map(([key, r]) => ({
    business_id: business.id,
    google_review_id: r.review_id ?? key,
    author_name: r.user?.name ?? 'Anonymous',
    author_photo_url: r.user?.thumbnail ?? null,
    rating: r.rating ?? 0,
    text: r.snippet ?? '',
    relative_time: r.date ?? '',
    images: storedImagesByReviewId.get(key) ?? [],
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('reviews')
      .upsert(rows, { onConflict: 'google_review_id' });
    if (upsertError) throw new Error(`Review upsert failed: ${upsertError.message}`);
  }

  const { data: storedRows, error: storedReviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', business.id);

  if (storedReviewsError) {
    throw new Error(`Stored reviews read failed: ${storedReviewsError.message}`);
  }

  // Google review-photo URLs can expire or become restricted while the
  // review itself remains available. Remove only confirmed-dead URLs so the
  // image filters use photos that can actually render. Transient failures are
  // retained by the validator and retried on the next refresh.
  const imageValidation = options.preserveUnavailableReviewImages
    ? {
        reviews: storedRows ?? [],
        changedReviews: [],
        checkedImages: 0,
        removedImages: 0,
      }
    : await removeUnavailableReviewImages(storedRows ?? []);
  if (imageValidation.changedReviews.length > 0) {
    const updates = await Promise.all(
      imageValidation.changedReviews.map(async (review) => {
        const { error } = await supabase
          .from('reviews')
          .update({ images: review.images ?? [] })
          .eq('id', review.id);
        return error;
      }),
    );
    const validationUpdateError = updates.find((error) => error !== null);
    if (validationUpdateError) {
      throw new Error(`Review image cleanup failed: ${validationUpdateError.message}`);
    }
  }

  console.info('[reviews-sync] Review images validated', {
    businessId: business.id,
    checkedImages: imageValidation.checkedImages,
    removedImages: imageValidation.removedImages,
    changedReviews: imageValidation.changedReviews.length,
  });

  const storedById = new Map(
    imageValidation.reviews.map((row) => [row.google_review_id as string, row])
  );
  const fetchedIds = new Set(rows.map((row) => row.google_review_id));
  const orderedStoredRows = [
    ...rows.flatMap((row) => {
      const stored = storedById.get(row.google_review_id);
      return stored ? [stored] : [];
    }),
    ...imageValidation.reviews.filter((row) => !fetchedIds.has(row.google_review_id)),
  ];

  // 4. Update business figures from Google
  const totalReviews = place_info?.reviews ?? business.total_reviews ?? null;
  const averageRating = place_info?.rating ?? business.average_rating ?? null;
  const syncedAt = new Date().toISOString();

  const { error: businessUpdateError } = await supabase
    .from('businesses')
    .update({
      ...(dataId ? { scrapedo_data_id: dataId } : {}),
      total_reviews: totalReviews,
      average_rating: averageRating,
      review_sync_status: complete ? 'complete' : 'partial',
      review_sync_target: targetReviews,
      review_sync_fetched: rows.length,
      review_sync_stop_reason: stopReason,
      review_sync_diagnostics: {
        fetchedPages,
        requestsMade,
        pages: pageDiagnostics,
        imageStorage: {
          attemptedImages: imageStorage.attemptedImages,
          storedImages: imageStorage.storedImages,
          failedImages: imageStorage.failedImages,
          preservedImages: imageStorage.preservedImages,
        },
      },
      reviews_last_synced_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq('id', business.id);

  if (businessUpdateError) {
    throw new Error(`Business sync update failed: ${businessUpdateError.message}`);
  }

  // 5. Snapshot into each widget's cached_reviews for the embed script
  // (both the badge and the carousel read from this cache)
  const cached = orderedStoredRows.map(mapReviewRow);

  const { data: updatedWidgets, error: widgetUpdateError } = await supabase
    .from('widgets')
    .update({
      cached_reviews: cached,
      last_synced_at: syncedAt,
    })
    .eq('business_id', business.id)
    .in('widget_type', ['google_reviews', 'google_reviews_carousel'])
    .select('id');

  if (widgetUpdateError) {
    throw new Error(`Widget review cache update failed: ${widgetUpdateError.message}`);
  }

  return {
    businessId: business.id,
    businessName: business.name,
    placeId,
    pagesFetched: fetchedPages,
    reviewsStored: cached.length,
    totalReviews,
    averageRating,
    widgetsUpdated: updatedWidgets?.length ?? 0,
    widgetIds: (updatedWidgets ?? []).map((widget) => widget.id),
    reviewsFetched: rows.length,
    targetReviews,
    complete,
    stopReason,
    requestsMade,
    pageDiagnostics,
    reviews: cached,
    syncedAt,
    imageValidation: {
      checkedImages: imageValidation.checkedImages,
      removedImages: imageValidation.removedImages,
      changedReviews: imageValidation.changedReviews.length,
    },
    imageStorage: {
      attemptedImages: imageStorage.attemptedImages,
      storedImages: imageStorage.storedImages,
      failedImages: imageStorage.failedImages,
      preservedImages: imageStorage.preservedImages,
    },
  };
}
