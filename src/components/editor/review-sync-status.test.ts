import { describe, expect, it } from 'vitest';
import { reviewSyncStatus } from './review-sync-status';

describe('reviewSyncStatus', () => {
  it('reports a partial sync without discarding the stored result', () => {
    expect(reviewSyncStatus({
      complete: false,
      reviewsFetched: 125,
      reviewsStored: 125,
      targetReviews: 500,
      pagesFetched: 7,
      totalReviews: 697,
      stopReason: 'no_new_reviews',
    })).toEqual({
      state: 'partial',
      message: '125 unique reviews stored. Google reports 697; Scrape.do returned no additional accessible reviews after retries.',
    });
  });

  it('explains when pagination ends before the sync limit', () => {
    expect(reviewSyncStatus({
      complete: false,
      reviewsFetched: 125,
      reviewsStored: 125,
      targetReviews: 500,
      totalReviews: 697,
      stopReason: 'missing_next_page_token',
    })).toEqual({
      state: 'partial',
      message: '125 unique reviews stored. Google reports 697; Scrape.do pagination ended before the 500-review sync limit. Refresh may find more.',
    });
  });

  it('reports a completed sync', () => {
    expect(reviewSyncStatus({
      complete: true,
      reviewsFetched: 500,
      reviewsStored: 500,
    })).toEqual({
      state: 'complete',
      message: '500 latest reviews fetched · 500 stored',
    });
  });
});
