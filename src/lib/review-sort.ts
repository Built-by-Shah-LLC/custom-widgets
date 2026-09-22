// Shared review sorting for the badge drawer and the carousel.
// Reviews only carry Google's relative date string ("3 weeks ago"), so
// newest/oldest sorting parses that into an approximate age in ms.

import type { Review } from './reviews-data';
import type { WidgetConfig } from './widget-config';

const UNIT_MS: Record<string, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_629_800_000, // ~30.44 days
  year: 31_557_600_000, // ~365.25 days
};

/** Approximate age of a review in ms. Unknown/unparseable dates sort last. */
export function relativeTimeToMs(relativeTime: string): number {
  const text = (relativeTime ?? '').trim().toLowerCase();
  if (!text) return Number.MAX_SAFE_INTEGER;

  // Google prefixes edited reviews: "Edited 7 years ago".
  const match = text.match(/^(?:edited\s+)?(?:(\d+)|a|an)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (match) {
    const n = match[1] ? parseInt(match[1], 10) : 1;
    return n * UNIT_MS[match[2]];
  }

  // Fall back to absolute dates ("2024-05-01", "May 1, 2024") if present.
  const parsed = Date.parse(relativeTime);
  if (!Number.isNaN(parsed)) return Math.max(0, Date.now() - parsed);

  return Number.MAX_SAFE_INTEGER;
}

export type DisplayedReview = {
  id: string;
  rating: number;
  relativeTime: string;
  images?: string[] | null;
};

/** Same inputs the badge drawer and carousel use to choose visible reviews. */
export type ReviewDisplayConfig = Pick<
  WidgetConfig,
  'minRating' | 'excludedReviewIds' | 'imageFiltering' | 'sortBy' | 'maxReviews'
>;

/**
 * Filter, then sort, then keep maxReviews. Order matches the embed exactly:
 * rating, exclusions, and image mode run before the slice, so a later filter
 * cannot shrink a list that was cut too early.
 */
export function selectDisplayedReviews<T extends DisplayedReview>(
  reviews: T[],
  config: ReviewDisplayConfig
): T[] {
  const excluded = new Set(config.excludedReviewIds);
  return reviews
    .filter((review) => review.rating >= config.minRating)
    .filter((review) => !excluded.has(review.id))
    .filter((review) => {
      if (config.imageFiltering === 'images_only') return (review.images?.length ?? 0) > 0;
      if (config.imageFiltering === 'no_images') return (review.images?.length ?? 0) === 0;
      return true;
    })
    .sort(reviewComparator(config))
    .slice(0, config.maxReviews);
}

/** Comparator for the configured sort. 'most_relevant' keeps Google's order. */
export function reviewComparator(
  config: Pick<WidgetConfig, 'sortBy' | 'imageFiltering'>
): (a: Review, b: Review) => number {
  return (a, b) => {
    if (config.imageFiltering === 'images_first') {
      // Boolean has-images grouping only — comparing counts would let a
      // review with 12 photos outrank an older one with 4.
      const imgDiff = Number((b.images?.length ?? 0) > 0) - Number((a.images?.length ?? 0) > 0);
      if (imgDiff !== 0) return imgDiff;
    }
    switch (config.sortBy) {
      case 'highest_rating':
        return b.rating - a.rating;
      case 'lowest_rating':
        return a.rating - b.rating;
      case 'newest':
        return relativeTimeToMs(a.relativeTime) - relativeTimeToMs(b.relativeTime);
      case 'oldest':
        return relativeTimeToMs(b.relativeTime) - relativeTimeToMs(a.relativeTime);
      default:
        return 0;
    }
  };
}
