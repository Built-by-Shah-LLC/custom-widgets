import { mirrorRefreshedReviewImages, type ReviewImageStorageResult } from './review-image-storage';
import { parseGoogleReviewImageUrl } from './review-images';
import { mapReviewRow, type ApiReview, type ReviewRowLike } from './widget-mappers';

export interface ReviewImageBusinessRow {
  id: string;
  name: string;
  place_id: string;
}

export interface HistoricalReviewRow extends ReviewRowLike {
  id: string;
  business_id: string;
  google_review_id: string | null;
  images: string[] | null;
}

export interface ReviewImageBackfillStore {
  getBusiness(businessId: string): Promise<ReviewImageBusinessRow>;
  listReviews(businessId: string): Promise<HistoricalReviewRow[]>;
  uploadReviewImage(input: {
    path: string;
    bytes: Uint8Array;
    contentType: string;
    cacheControl: string;
  }): Promise<string>;
  updateReviewImages(input: {
    businessId: string;
    reviewRowId: string;
    images: string[];
  }): Promise<void>;
  updateWidgetCaches(input: {
    businessId: string;
    reviews: ApiReview[];
  }): Promise<string[]>;
}

export interface ReviewImageBackfillResult {
  businessId: string;
  businessName: string;
  placeId: string;
  reviewsScanned: number;
  candidateReviews: number;
  candidateImages: number;
  attemptedImages: number;
  storedImages: number;
  failedImages: number;
  preservedImages: number;
  updatedReviews: number;
  remainingGoogleImages: number;
  failures: ReviewImageStorageResult['failures'];
  widgetIds: string[];
  reviews: ApiReview[];
}

interface BackfillOptions {
  batchSize?: number;
  concurrency?: number;
  maxBytes?: number;
  maxTotalBytesPerBatch?: number;
  fetchImpl?: typeof fetch;
}

function imageUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((image): image is string => typeof image === 'string' && image.length > 0)
    : [];
}

export function replaceWidgetCachedReviewImages(
  cachedReviews: unknown,
  reviews: ApiReview[],
): { cachedReviews: unknown; changed: boolean } {
  if (!Array.isArray(cachedReviews)) return { cachedReviews, changed: false };

  const imagesByReviewId = new Map(reviews.map((review) => [review.id, review.images ?? []]));
  let changed = false;
  const updated = cachedReviews.map((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const cached = value as Record<string, unknown>;
    const reviewId = typeof cached.id === 'string'
      ? cached.id
      : typeof cached.google_review_id === 'string'
        ? cached.google_review_id
        : null;
    if (!reviewId || !imagesByReviewId.has(reviewId)) return value;

    const nextImages = imagesByReviewId.get(reviewId) ?? [];
    if (JSON.stringify(imageUrls(cached.images)) === JSON.stringify(nextImages)) return value;
    changed = true;
    return { ...cached, images: nextImages };
  });

  return { cachedReviews: updated, changed };
}

function countGoogleImages(reviews: HistoricalReviewRow[]): number {
  return reviews.reduce(
    (count, review) => count + imageUrls(review.images).filter((image) => parseGoogleReviewImageUrl(image)).length,
    0,
  );
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function backfillBusinessReviewImages(
  store: ReviewImageBackfillStore,
  businessId: string,
  options: BackfillOptions = {},
): Promise<ReviewImageBackfillResult> {
  const business = await store.getBusiness(businessId);
  const reviews = await store.listReviews(businessId);
  const candidates = reviews.filter((review) =>
    imageUrls(review.images).some((image) => parseGoogleReviewImageUrl(image))
  );
  const reviewsByRowId = new Map(reviews.map((review) => [review.id, review]));
  const result: ReviewImageBackfillResult = {
    businessId,
    businessName: business.name,
    placeId: business.place_id,
    reviewsScanned: reviews.length,
    candidateReviews: candidates.length,
    candidateImages: countGoogleImages(candidates),
    attemptedImages: 0,
    storedImages: 0,
    failedImages: 0,
    preservedImages: 0,
    updatedReviews: 0,
    remainingGoogleImages: 0,
    failures: [],
    widgetIds: [],
    reviews: [],
  };

  for (const batch of chunk(candidates, Math.max(1, options.batchSize ?? 25))) {
    const compactSourcesByReviewId = new Map<string, string[]>();
    for (const review of batch) {
      compactSourcesByReviewId.set(
        review.google_review_id ?? review.id,
        imageUrls(review.images).filter((image) => parseGoogleReviewImageUrl(image)),
      );
    }

    const storage = await mirrorRefreshedReviewImages(
      businessId,
      batch.map((review) => {
        const reviewId = review.google_review_id ?? review.id;
        const googleImages = compactSourcesByReviewId.get(reviewId) ?? [];
        return { reviewId, images: googleImages, previousImages: googleImages };
      }),
      {
        upload: store.uploadReviewImage,
        fetchImpl: options.fetchImpl,
        concurrency: options.concurrency,
        maxBytes: options.maxBytes,
        maxTotalBytes: options.maxTotalBytesPerBatch,
      },
    );

    result.attemptedImages += storage.attemptedImages;
    result.storedImages += storage.storedImages;
    result.failedImages += storage.failedImages;
    result.preservedImages += storage.preservedImages;
    result.failures.push(...storage.failures);

    const resolvedByReviewId = new Map(
      storage.reviews.map((review) => [review.reviewId, review.images]),
    );
    for (const review of batch) {
      const reviewId = review.google_review_id ?? review.id;
      const original = imageUrls(review.images);
      const resolvedGoogleImages = resolvedByReviewId.get(reviewId) ?? [];
      let googleIndex = 0;
      const nextImages = original.map((image) => {
        if (!parseGoogleReviewImageUrl(image)) return image;
        const resolved = resolvedGoogleImages[googleIndex];
        googleIndex += 1;
        return resolved ?? image;
      });

      if (nextImages.some((image, index) => image !== original[index])) {
        await store.updateReviewImages({ businessId, reviewRowId: review.id, images: nextImages });
        reviewsByRowId.set(review.id, { ...review, images: nextImages });
        result.updatedReviews += 1;
      }
    }
  }

  const updatedReviews = Array.from(reviewsByRowId.values());
  result.reviews = updatedReviews.map(mapReviewRow);
  result.widgetIds = await store.updateWidgetCaches({ businessId, reviews: result.reviews });
  result.remainingGoogleImages = countGoogleImages(updatedReviews);
  return result;
}
