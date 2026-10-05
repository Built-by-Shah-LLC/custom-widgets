import { describe, expect, it } from 'vitest';
import type { WidgetConfig } from './widget-config';
import { selectDisplayedReviews } from './review-sort';

const baseConfig: Pick<
  WidgetConfig,
  'minRating' | 'excludedReviewIds' | 'imageFiltering' | 'sortBy' | 'maxReviews'
> = {
  minRating: 1,
  excludedReviewIds: [],
  imageFiltering: 'all',
  sortBy: 'highest_rating',
  maxReviews: 20,
};

const review = (
  id: string,
  rating: number,
  relativeTime: string,
  images: string[] = [],
) => ({ id, rating, relativeTime, images });

describe('review sorting', () => {
  it('uses newest-first as the tie-breaker for highest rating', () => {
    const shown = selectDisplayedReviews([
      review('four-old', 4, '4 months ago'),
      review('five-old', 5, '3 months ago'),
      review('five-new', 5, 'a week ago'),
      review('four-new', 4, '2 weeks ago'),
    ], baseConfig);

    expect(shown.map(({ id }) => id)).toEqual([
      'five-new',
      'five-old',
      'four-new',
      'four-old',
    ]);
  });

  it('uses newest-first as the tie-breaker for lowest rating', () => {
    const shown = selectDisplayedReviews([
      review('four-old', 4, '4 months ago'),
      review('three-old', 3, '3 months ago'),
      review('three-new', 3, 'a week ago'),
      review('four-new', 4, '2 weeks ago'),
    ], { ...baseConfig, sortBy: 'lowest_rating' });

    expect(shown.map(({ id }) => id)).toEqual([
      'three-new',
      'three-old',
      'four-new',
      'four-old',
    ]);
  });

  it('keeps the images-first group ahead of rating and date sorting', () => {
    const shown = selectDisplayedReviews([
      review('no-image-five', 5, 'a day ago'),
      review('image-four-old', 4, '3 months ago', ['old.jpg']),
      review('image-four-new', 4, 'a week ago', ['new.jpg']),
      review('no-image-three', 3, '2 days ago'),
    ], { ...baseConfig, imageFiltering: 'images_first' });

    expect(shown.map(({ id }) => id)).toEqual([
      'image-four-new',
      'image-four-old',
      'no-image-five',
      'no-image-three',
    ]);
  });
});
