import type { Review } from '@/lib/reviews-data';
import type { BusinessOption } from './tabs';

interface LiveCacheResponse {
  liveCacheWarning?: string;
}

export interface ReviewSyncResponse extends LiveCacheResponse {
  businessName?: string;
  averageRating?: number;
  totalReviews?: number | null;
  reviews?: Review[];
  complete?: boolean;
  reviewsFetched?: number;
  reviewsStored?: number;
  targetReviews?: number;
  pagesFetched?: number;
  stopReason?: string;
}

export interface ReviewPhotoMigrationResponse extends LiveCacheResponse {
  reviews?: Review[];
  candidateImages?: number;
  storedImages?: number;
  verifiedImages?: number;
  removedUnavailableImages?: number;
  remainingGoogleImages?: number;
  refreshTriggered?: boolean;
  refreshError?: string;
  complete?: boolean;
}

export interface SavedBusinessResponse extends LiveCacheResponse {
  id: string;
  placeId: string;
  name: string;
  address: string;
  averageRating: number;
  totalReviews: number;
  reviews?: Review[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseError(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  if (typeof value.message === 'string') return value.message;
  if (typeof value.error === 'string') return value.error;
  return fallback;
}

async function postJson<T extends object>(
  url: string,
  body: object,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new Error(responseError(result, fallbackError));
  if (!isRecord(result)) throw new Error(fallbackError);
  return result as T;
}

export function requestReviewSync(placeId: string): Promise<ReviewSyncResponse> {
  return postJson('/api/v1/sync', { placeId }, 'Review fetch failed');
}

export function requestReviewPhotoMigration(
  businessId: string,
): Promise<ReviewPhotoMigrationResponse> {
  return postJson(
    '/api/v1/review-images/migrate',
    { businessId },
    'Review photo migration failed',
  );
}

export function requestBusinessSelection(
  business: BusinessOption,
): Promise<SavedBusinessResponse> {
  return postJson('/api/v1/businesses', business, 'Could not select business');
}
