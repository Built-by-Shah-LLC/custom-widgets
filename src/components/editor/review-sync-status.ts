export type ReviewLoadStatus = {
  state: 'loading' | 'complete' | 'partial' | 'error';
  message: string;
};

interface ReviewSyncApiResult {
  complete?: boolean;
  reviewsFetched?: number;
  reviewsStored?: number;
  targetReviews?: number;
  pagesFetched?: number;
  totalReviews?: number | null;
  stopReason?: string;
}

export function reviewSyncStatus(result: ReviewSyncApiResult): ReviewLoadStatus {
  const fetched = Number(result.reviewsFetched ?? 0);
  const stored = Number(result.reviewsStored ?? 0);

  if (result.complete === false) {
    const target = Number(result.targetReviews ?? 500);
    const reported = Number(result.totalReviews ?? target);

    if (result.stopReason === 'no_new_reviews') {
      return {
        state: 'partial',
        message: `${stored} unique reviews stored. Google reports ${reported}; Scrape.do returned no additional accessible reviews after retries.`,
      };
    }

    return {
      state: 'partial',
      message: `${stored} unique reviews stored. Google reports ${reported}; Scrape.do pagination ended before the ${target}-review sync limit. Refresh may find more.`,
    };
  }

  return {
    state: 'complete',
    message: `${fetched} latest reviews fetched · ${stored} stored`,
  };
}
