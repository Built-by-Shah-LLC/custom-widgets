import { parseGoogleReviewImageUrl } from './review-images';

const CONFIRMED_UNAVAILABLE_STATUSES = new Set([401, 403, 404, 410]);
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CONCURRENCY = 8;

export interface ReviewWithImages {
  images?: string[] | null;
}

export interface ReviewImageValidationResult<T> {
  reviews: T[];
  changedReviews: T[];
  checkedImages: number;
  removedImages: number;
}

interface ValidationOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
}

/**
 * Keep an image unless Google definitively says it is unavailable. Transient
 * failures remain in the snapshot so one network incident cannot erase review
 * media. A successful non-image response is unusable and is removed.
 */
async function googleReviewImageIsUsable(
  value: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<boolean> {
  const url = parseGoogleReviewImageUrl(value);
  if (!url) return true;

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Range: 'bytes=0-0',
      },
    });
    await response.body?.cancel();

    if (response.ok) {
      return (response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/');
    }

    return !CONFIRMED_UNAVAILABLE_STATUSES.has(response.status);
  } catch {
    return true;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

/** Remove confirmed-dead Google image URLs before image filtering and sorting. */
export async function removeUnavailableReviewImages<T extends ReviewWithImages>(
  reviews: T[],
  options: ValidationOptions = {},
): Promise<ReviewImageValidationResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const uniqueGoogleImages = [...new Set(
    reviews.flatMap((review) => review.images ?? [])
      .filter((image) => parseGoogleReviewImageUrl(image) !== null),
  )];
  const usability = await mapWithConcurrency(
    uniqueGoogleImages,
    concurrency,
    async (image) => [
      image,
      await googleReviewImageIsUsable(image, fetchImpl, timeoutMs),
    ] as const,
  );
  const usableByUrl = new Map(usability);
  let removedImages = 0;
  const changedReviews: T[] = [];

  const cleaned = reviews.map((review) => {
    if (!review.images?.length) return review;
    const images = review.images.filter((image) => usableByUrl.get(image) !== false);
    if (images.length === review.images.length) return review;

    removedImages += review.images.length - images.length;
    const changed = { ...review, images };
    changedReviews.push(changed);
    return changed;
  });

  return {
    reviews: cleaned,
    changedReviews,
    checkedImages: uniqueGoogleImages.length,
    removedImages,
  };
}
