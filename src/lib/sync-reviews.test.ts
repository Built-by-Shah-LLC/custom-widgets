import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchAllScrapeDoReviews: vi.fn(),
  mirrorRefreshedReviewImages: vi.fn(),
  removeUnavailableReviewImages: vi.fn(),
  uploadVerifiedReviewImage: vi.fn(),
  reviewUpsert: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./scrapedo', () => ({
  fetchAllScrapeDoReviews: mocks.fetchAllScrapeDoReviews,
}));

vi.mock('./review-image-storage', () => ({
  mirrorRefreshedReviewImages: mocks.mirrorRefreshedReviewImages,
}));

vi.mock('./verified-review-image-upload', () => ({
  uploadVerifiedReviewImage: mocks.uploadVerifiedReviewImage,
}));

vi.mock('./review-image-validation', () => ({
  removeUnavailableReviewImages: mocks.removeUnavailableReviewImages,
}));

vi.mock('./db', () => ({
  supabase: {
    from: mocks.from,
  },
}));

import { syncBusinessReviews } from './sync-reviews';

describe('syncBusinessReviews review image storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SCRAPEDO_TOKEN', 'test-token');

    const storedImage = 'https://project.supabase.co/storage/v1/object/public/review-images/stored.jpg';
    const storedRows = [{
      id: 'row-1',
      business_id: 'business-1',
      google_review_id: 'review-1',
      author_name: 'Reviewer',
      author_photo_url: 'https://lh3.googleusercontent.com/avatar=s100',
      rating: 5,
      text: 'Excellent',
      relative_time: 'today',
      images: [storedImage],
    }];

    mocks.fetchAllScrapeDoReviews.mockResolvedValue({
      reviews: [{
        review_id: 'review-1',
        rating: 5,
        date: 'today',
        snippet: 'Excellent',
        images: ['https://lh3.googleusercontent.com/review=fresh'],
        user: {
          name: 'Reviewer',
          thumbnail: 'https://lh3.googleusercontent.com/avatar=s100',
        },
      }],
      place_info: { reviews: 1, rating: 5 },
      dataId: '0x123:0x456',
      fetchedPages: 1,
      requestsMade: 1,
      targetReviews: 1,
      complete: true,
      stopReason: 'target_reached',
      pageDiagnostics: [],
    });
    mocks.mirrorRefreshedReviewImages.mockImplementation(
      async (_businessId, _reviews, options) => {
        const publicUrl = await options.upload({
          path: 'business-1/review-1/photo.jpg',
          bytes: Uint8Array.from([0xff, 0xd8, 0xff]),
          contentType: 'image/jpeg',
          cacheControl: '31536000',
        });
        return {
          reviews: [{ reviewId: 'review-1', images: [publicUrl] }],
          attemptedImages: 1,
          storedImages: 1,
          failedImages: 0,
          preservedImages: 0,
        };
      },
    );
    mocks.removeUnavailableReviewImages.mockImplementation(async (reviews) => ({
      reviews,
      changedReviews: [],
      checkedImages: 0,
      removedImages: 0,
    }));
    mocks.reviewUpsert.mockResolvedValue({ error: null });
    mocks.uploadVerifiedReviewImage.mockResolvedValue(storedImage);

    mocks.from.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'business-1',
                  name: 'Example Business',
                  place_id: 'place-1',
                  scrapedo_data_id: null,
                  total_reviews: 1,
                  average_rating: 5,
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === 'reviews') {
        return {
          select: vi.fn((columns: string) => columns === 'google_review_id, images'
            ? {
                eq: vi.fn(() => ({
                  in: vi.fn().mockResolvedValue({
                    data: [{
                      google_review_id: 'review-1',
                      images: ['https://lh3.googleusercontent.com/review=old'],
                    }],
                    error: null,
                  }),
                })),
              }
            : {
                eq: vi.fn().mockResolvedValue({ data: storedRows, error: null }),
              }),
          upsert: mocks.reviewUpsert,
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }

      if (table === 'widgets') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({ data: [{ id: 'widget-1' }], error: null }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('stores mirrored review URLs while leaving the author avatar unchanged', async () => {
    const result = await syncBusinessReviews('place-1', 40);

    expect(mocks.fetchAllScrapeDoReviews).toHaveBeenCalledWith(
      'place-1',
      'test-token',
      40,
      'newest',
      expect.any(Object),
    );
    expect(mocks.fetchAllScrapeDoReviews).toHaveBeenCalledTimes(1);

    expect(mocks.mirrorRefreshedReviewImages).toHaveBeenCalledWith(
      'business-1',
      [{
        reviewId: 'review-1',
        images: ['https://lh3.googleusercontent.com/review=fresh'],
        previousImages: ['https://lh3.googleusercontent.com/review=old'],
      }],
      expect.objectContaining({ upload: expect.any(Function) }),
    );
    expect(mocks.reviewUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        google_review_id: 'review-1',
        author_photo_url: 'https://lh3.googleusercontent.com/avatar=s100',
        images: ['https://project.supabase.co/storage/v1/object/public/review-images/stored.jpg'],
      }),
    ], { onConflict: 'google_review_id' });
    expect(mocks.uploadVerifiedReviewImage).toHaveBeenCalledWith({
      path: 'business-1/review-1/photo.jpg',
      bytes: expect.any(Uint8Array),
      cacheControl: '31536000',
      contentType: 'image/jpeg',
    });
    expect(result.imageStorage).toEqual({
      attemptedImages: 1,
      storedImages: 1,
      failedImages: 0,
      preservedImages: 0,
    });
    expect(result.reviews[0].authorPhotoUrl).toBe(
      'https://lh3.googleusercontent.com/avatar=s100',
    );
  });

  it('supports a relevance pass for image discovery', async () => {
    await syncBusinessReviews('place-1', 40, { sortBy: 'relevance' });

    expect(mocks.fetchAllScrapeDoReviews).toHaveBeenCalledWith(
      'place-1',
      'test-token',
      40,
      'relevance',
      expect.any(Object),
    );
  });

  it('merges relevance reviews and stores their photos when newest is incomplete', async () => {
    const storedImage = 'https://project.supabase.co/storage/v1/object/public/review-images/discovered.jpg';
    const storedNewestImage = 'https://project.supabase.co/storage/v1/object/public/review-images/newest.jpg';
    mocks.fetchAllScrapeDoReviews
      .mockResolvedValueOnce({
        reviews: [{
          review_id: 'review-1',
          rating: 5,
          date: 'today',
          snippet: 'Newest review',
          images: ['https://lh3.googleusercontent.com/review=newest-photo'],
          user: { name: 'Newest Reviewer' },
        }],
        place_info: { reviews: 213, rating: 4.9 },
        dataId: '0x123:0x456',
        fetchedPages: 1,
        requestsMade: 3,
        targetReviews: 213,
        complete: false,
        stopReason: 'no_new_reviews',
        pageDiagnostics: [{
          pass: 1,
          page: 1,
          reviewCount: 1,
          newReviewCount: 1,
          attempts: 3,
          hasNextPageToken: false,
          identifier: 'data_id',
        }],
      })
      .mockResolvedValueOnce({
        reviews: [
          {
            review_id: 'review-1',
            rating: 5,
            date: 'today',
            snippet: 'Newest review',
            images: [],
            user: { name: 'Newest Reviewer' },
          },
          {
            review_id: 'review-with-photo',
            rating: 5,
            date: '6 months ago',
            snippet: 'Historical photo review',
            images: ['https://lh3.googleusercontent.com/review=discovered'],
            user: { name: 'Photo Reviewer' },
          },
        ],
        place_info: { reviews: 213, rating: 4.9 },
        dataId: '0x123:0x456',
        fetchedPages: 1,
        requestsMade: 3,
        targetReviews: 213,
        complete: false,
        stopReason: 'no_new_reviews',
        pageDiagnostics: [{
          pass: 1,
          page: 1,
          reviewCount: 2,
          newReviewCount: 2,
          attempts: 3,
          hasNextPageToken: false,
          identifier: 'data_id',
        }],
      });
    mocks.mirrorRefreshedReviewImages.mockImplementationOnce(async (_businessId, reviews) => ({
      reviews: reviews.map((review: { reviewId: string }) => ({
        reviewId: review.reviewId,
        images: review.reviewId === 'review-with-photo' ? [storedImage] : [storedNewestImage],
      })),
      attemptedImages: 2,
      storedImages: 2,
      failedImages: 0,
      preservedImages: 0,
    }));

    const result = await syncBusinessReviews('place-1', 500);

    expect(mocks.fetchAllScrapeDoReviews).toHaveBeenNthCalledWith(
      1,
      'place-1',
      'test-token',
      500,
      'newest',
      expect.any(Object),
    );
    expect(mocks.fetchAllScrapeDoReviews).toHaveBeenNthCalledWith(
      2,
      'place-1',
      'test-token',
      500,
      'relevance',
      expect.objectContaining({ dataId: '0x123:0x456' }),
    );
    expect(mocks.mirrorRefreshedReviewImages).toHaveBeenCalledWith(
      'business-1',
      expect.arrayContaining([
        {
          reviewId: 'review-1',
          images: ['https://lh3.googleusercontent.com/review=newest-photo'],
          previousImages: ['https://lh3.googleusercontent.com/review=old'],
        },
        {
          reviewId: 'review-with-photo',
          images: ['https://lh3.googleusercontent.com/review=discovered'],
          previousImages: [],
        },
      ]),
      expect.any(Object),
    );
    expect(mocks.reviewUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          google_review_id: 'review-with-photo',
          images: [storedImage],
        }),
      ]),
      { onConflict: 'google_review_id' },
    );
    expect(result).toMatchObject({
      reviewsFetched: 2,
      targetReviews: 213,
      complete: false,
      stopReason: 'no_new_reviews',
      pagesFetched: 2,
      requestsMade: 6,
      imageStorage: {
        attemptedImages: 2,
        storedImages: 2,
        failedImages: 0,
        preservedImages: 0,
      },
    });
    expect(result.pageDiagnostics.map((page) => page.sortBy)).toEqual([
      'newest',
      'relevance',
    ]);
  });

  it('can preserve unavailable historical URLs during a 403 migration refresh', async () => {
    const result = await syncBusinessReviews('place-1', 40, {
      preserveMissingReviewImages: true,
      preserveUnavailableReviewImages: true,
    });

    expect(mocks.mirrorRefreshedReviewImages).toHaveBeenCalledWith(
      'business-1',
      expect.any(Array),
      expect.objectContaining({ preserveMissingPreviousImages: true }),
    );
    expect(mocks.removeUnavailableReviewImages).not.toHaveBeenCalled();
    expect(result.imageValidation).toEqual({
      checkedImages: 0,
      removedImages: 0,
      changedReviews: 0,
    });
  });
});
