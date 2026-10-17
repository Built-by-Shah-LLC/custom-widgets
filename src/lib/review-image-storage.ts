import { createHash } from 'node:crypto';
import { parseGoogleReviewImageUrl } from './review-images';

export const REVIEW_IMAGES_BUCKET = 'review-images';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const IMMUTABLE_CACHE_SECONDS = '31536000';

const EXTENSION_BY_CONTENT_TYPE = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export interface RefreshedReviewImageInput {
  reviewId: string;
  images?: string[] | null;
  previousImages?: string[] | null;
}

export interface ReviewImageUploadInput {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  cacheControl: string;
}

export interface ReviewImageStorageResult {
  reviews: Array<{
    reviewId: string;
    images: string[];
  }>;
  attemptedImages: number;
  storedImages: number;
  failedImages: number;
  preservedImages: number;
  failures: Array<{
    reviewId: string;
    imageIndex: number;
    reason: string;
  }>;
}

interface MirrorReviewImageOptions {
  upload: (input: ReviewImageUploadInput) => Promise<string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxTotalBytes?: number;
  concurrency?: number;
  preserveMissingPreviousImages?: boolean;
}

interface DownloadedImage {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
  contentHash: string;
}

interface ImageJob {
  reviewIndex: number;
  imageIndex: number;
  reviewId: string;
  source: string;
  previous?: string;
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function imageSignatureMatches(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === 'image/gif') {
    const signature = new TextDecoder().decode(bytes.subarray(0, 6));
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (contentType === 'image/webp') {
    return new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF'
      && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';
  }
  if (contentType === 'image/avif') {
    const boxType = new TextDecoder().decode(bytes.subarray(4, 12));
    return boxType === 'ftypavif' || boxType === 'ftypavis';
  }
  return false;
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        await mapper(values[index]);
      }
    },
  );
  await Promise.all(workers);
}

async function readImageBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('Review image exceeds the configured size limit');
  }

  if (!response.body) throw new Error('Review image response has no body');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('Review image exceeds the configured size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new Error('Review image response is empty');

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function downloadReviewImage(
  source: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number,
): Promise<DownloadedImage> {
  const sourceUrl = parseGoogleReviewImageUrl(source);
  if (!sourceUrl) throw new Error('Unsupported review image source');

  const response = await fetchImpl(sourceUrl, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });

  const contentType = (response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const extension = EXTENSION_BY_CONTENT_TYPE.get(contentType);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Review image source returned HTTP ${response.status}`);
  }
  if (!extension) {
    await response.body?.cancel();
    throw new Error('Review image source did not return a supported image');
  }

  const bytes = await readImageBytes(response, maxBytes);
  if (!imageSignatureMatches(bytes, contentType)) {
    throw new Error('Review image bytes do not match the declared content type');
  }
  return {
    bytes,
    contentType,
    extension,
    contentHash: sha256(bytes).slice(0, 32),
  };
}

/**
 * Captures review photos while their short-lived Google URLs are still usable.
 * A failed image keeps the same-index previously stored URL when one exists;
 * brand-new failures are omitted instead of persisting another expiring URL.
 */
export async function mirrorRefreshedReviewImages(
  businessId: string,
  reviews: RefreshedReviewImageInput[],
  options: MirrorReviewImageOptions,
): Promise<ReviewImageStorageResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  let preservedMissingImages = 0;
  const output = reviews.map((review) => {
    const incomingLength = review.images?.length ?? 0;
    const outputLength = options.preserveMissingPreviousImages
      ? Math.max(incomingLength, review.previousImages?.length ?? 0)
      : incomingLength;
    const images = new Array<string | undefined>(outputLength);
    if (options.preserveMissingPreviousImages) {
      for (let index = incomingLength; index < outputLength; index += 1) {
        const previous = review.previousImages?.[index];
        if (!previous) continue;
        images[index] = previous;
        preservedMissingImages += 1;
      }
    }
    return { reviewId: review.reviewId, images };
  });
  const jobs: ImageJob[] = [];

  reviews.forEach((review, reviewIndex) => {
    (review.images ?? []).forEach((source, imageIndex) => {
      jobs.push({
        reviewIndex,
        imageIndex,
        reviewId: review.reviewId,
        source,
        previous: review.previousImages?.[imageIndex],
      });
    });
  });

  let storedImages = 0;
  let failedImages = 0;
  let preservedImages = preservedMissingImages;
  let attemptedUploadBytes = 0;
  const failures: ReviewImageStorageResult['failures'] = [];
  const downloadCache = new Map<string, Promise<DownloadedImage>>();
  const remainingJobsBySource = new Map<string, number>();
  for (const job of jobs) {
    remainingJobsBySource.set(job.source, (remainingJobsBySource.get(job.source) ?? 0) + 1);
  }

  await mapWithConcurrency(jobs, concurrency, async (job) => {
    try {
      let download = downloadCache.get(job.source);
      if (!download) {
        download = downloadReviewImage(job.source, fetchImpl, timeoutMs, maxBytes);
        downloadCache.set(job.source, download);
      }
      const image = await download;
      if (attemptedUploadBytes + image.bytes.byteLength > maxTotalBytes) {
        throw new Error('Review image refresh exceeds the total byte limit');
      }
      attemptedUploadBytes += image.bytes.byteLength;
      const reviewKey = sha256(job.reviewId).slice(0, 32);
      const path = `${businessId}/${reviewKey}/${job.imageIndex}-${image.contentHash}.${image.extension}`;
      const publicUrl = await options.upload({
        path,
        bytes: image.bytes,
        contentType: image.contentType,
        cacheControl: IMMUTABLE_CACHE_SECONDS,
      });
      const parsedPublicUrl = new URL(publicUrl);
      if (parsedPublicUrl.protocol !== 'https:') {
        throw new Error('Review image upload returned an invalid public URL');
      }
      output[job.reviewIndex].images[job.imageIndex] = parsedPublicUrl.href;
      storedImages += 1;
    } catch (error) {
      failedImages += 1;
      failures.push({
        reviewId: job.reviewId,
        imageIndex: job.imageIndex,
        reason: error instanceof Error ? error.message : 'Unknown image-storage failure',
      });
      if (job.previous) {
        output[job.reviewIndex].images[job.imageIndex] = job.previous;
        preservedImages += 1;
      }
    } finally {
      const remaining = (remainingJobsBySource.get(job.source) ?? 1) - 1;
      if (remaining <= 0) {
        remainingJobsBySource.delete(job.source);
        downloadCache.delete(job.source);
      } else {
        remainingJobsBySource.set(job.source, remaining);
      }
    }
  });

  return {
    reviews: output.map((review) => ({
      reviewId: review.reviewId,
      images: review.images.filter((image): image is string => Boolean(image)),
    })),
    attemptedImages: jobs.length,
    storedImages,
    failedImages,
    preservedImages,
    failures,
  };
}
