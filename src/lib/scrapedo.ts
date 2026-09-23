// Scrape.do Google Maps Reviews API client.
// Docs: https://scrape.do/documentation/google-scraper-api/maps/reviews/

export interface ScrapeDoReview {
  review_id?: string;
  rating?: number;
  date?: string;
  snippet?: string;
  images?: string[];
  user?: {
    name?: string;
    thumbnail?: string;
    link?: string;
  };
}

export interface ScrapeDoPlaceInfo {
  title?: string;
  address?: string;
  rating?: number;
  reviews?: number;
  type?: string;
}

// The live API currently reports these accepted values in its 400 response.
// Scrape.do's public documentation still lists older camel-case values.
export type ScrapeDoReviewSort =
  | 'relevance'
  | 'newest'
  | 'highest_rating'
  | 'lowest_rating';

interface ScrapeDoPage {
  reviews?: ScrapeDoReview[];
  place_info?: ScrapeDoPlaceInfo;
  pagination?: { next_page_token?: string };
  search_parameters?: { data_id?: string };
}

const ENDPOINT = 'https://api.scrape.do/plugin/google/maps/reviews';
const PAGE_SIZE = 20;
const DEFAULT_PREMATURE_END_RETRIES = 2;
const DEFAULT_PREMATURE_END_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_PAGINATION_PASSES = 3;
const DEFAULT_MAX_STAGNANT_PASSES = 2;

export type ScrapeDoStopReason =
  | 'target_reached'
  | 'empty_page'
  | 'missing_next_page_token'
  | 'page_limit_reached'
  | 'repeated_page_token'
  | 'no_new_reviews';

export interface ScrapeDoPageDiagnostic {
  pass: number;
  page: number;
  reviewCount: number;
  newReviewCount: number;
  attempts: number;
  hasNextPageToken: boolean;
  identifier: 'data_id' | 'place_id';
}

export interface ScrapeDoFetchOptions {
  dataId?: string | null;
  expectedReviewCount?: number | null;
  prematureEndRetries?: number;
  prematureEndRetryDelayMs?: number;
  maxPaginationPasses?: number;
  maxStagnantPasses?: number;
}

export interface ScrapeDoReviewsResult {
  reviews: ScrapeDoReview[];
  place_info?: ScrapeDoPlaceInfo;
  dataId?: string;
  fetchedPages: number;
  requestsMade: number;
  targetReviews: number;
  complete: boolean;
  stopReason: ScrapeDoStopReason;
  pageDiagnostics: ScrapeDoPageDiagnostic[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(
  placeId: string,
  dataId: string | undefined,
  token: string,
  num: number,
  pageToken?: string,
  sortBy?: ScrapeDoReviewSort
): Promise<{ page: ScrapeDoPage; attempts: number }> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('token', token);
  if (dataId) url.searchParams.set('data_id', dataId);
  else url.searchParams.set('place_id', placeId);
  url.searchParams.set('num', String(num));
  if (pageToken) url.searchParams.set('next_page_token', pageToken);
  if (sortBy) url.searchParams.set('sort_by', sortBy);

  // Per docs: a transient 502 on a page that should exist is recoverable — retry once.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      return { page: await response.json(), attempts: attempt + 1 };
    }

    const text = await response.text();
    lastError = new Error(`Scrape.do HTTP ${response.status}: ${text}`);
    if (response.status !== 502) break;
  }

  throw lastError ?? new Error('Scrape.do request failed');
}

function reviewTarget(
  maxReviews: number,
  placeInfo: ScrapeDoPlaceInfo | undefined,
  expectedReviewCount: number | null | undefined
) {
  const available = placeInfo?.reviews ?? expectedReviewCount;
  return typeof available === 'number' && Number.isFinite(available) && available >= 0
    ? Math.min(maxReviews, available)
    : maxReviews;
}

function reviewIdentity(review: ScrapeDoReview) {
  return review.review_id ?? [
    review.user?.name ?? 'anon',
    review.date ?? '',
    review.rating ?? '',
    review.snippet ?? '',
  ].join('|');
}

export async function fetchAllScrapeDoReviews(
  placeId: string,
  token: string,
  maxReviews = 40,
  sortBy?: ScrapeDoReviewSort,
  options: ScrapeDoFetchOptions = {}
): Promise<ScrapeDoReviewsResult> {
  const all = new Map<string, ScrapeDoReview>();
  let fetchedPages = 0;
  let requestsMade = 0;
  let placeInfo: ScrapeDoPlaceInfo | undefined;
  let resolvedDataId = options.dataId ?? undefined;
  let stopReason: ScrapeDoStopReason = 'target_reached';
  const pageDiagnostics: ScrapeDoPageDiagnostic[] = [];
  const prematureEndRetries = Math.max(
    0,
    options.prematureEndRetries ?? DEFAULT_PREMATURE_END_RETRIES
  );
  const retryDelayMs = Math.max(
    0,
    options.prematureEndRetryDelayMs ?? DEFAULT_PREMATURE_END_RETRY_DELAY_MS
  );
  const maxPaginationPasses = Math.max(
    1,
    options.maxPaginationPasses ?? DEFAULT_MAX_PAGINATION_PASSES
  );
  const maxStagnantPasses = Math.max(
    1,
    options.maxStagnantPasses ?? DEFAULT_MAX_STAGNANT_PASSES
  );
  let stagnantPasses = 0;

  // Scrape.do can omit a valid next_page_token nondeterministically. Restart a
  // bounded number of complete pagination chains and union their stable review
  // IDs, rather than treating one missing token as authoritative.
  for (let pass = 1; pass <= maxPaginationPasses; pass += 1) {
    const reviewsBeforePass = all.size;
    let pageToken: string | undefined;
    let pagesThisPass = 0;
    const seenPageTokens = new Set<string>();

    while (all.size < maxReviews) {
      // Keep a stable page size across restarted chains. Shrinking `num` based
      // on already-unioned reviews changes token boundaries and costs requests.
      const num = Math.min(PAGE_SIZE, maxReviews);
      const requestDataId = resolvedDataId;
      let acceptedPage: ScrapeDoPage | undefined;
      let bestTerminalPage: ScrapeDoPage | undefined;
      let bestTerminalNewReviews = -1;
      let pageAttempts = 0;

      for (let retry = 0; retry <= prematureEndRetries; retry += 1) {
        const result = await fetchPage(
          placeId,
          requestDataId,
          token,
          num,
          pageToken,
          sortBy
        );
        requestsMade += result.attempts;
        pageAttempts += result.attempts;

        const page = result.page;
        if (!placeInfo && page.place_info) placeInfo = page.place_info;
        if (page.search_parameters?.data_id) {
          resolvedDataId = page.search_parameters.data_id;
        }

        const reviews = page.reviews ?? [];
        const newReviewCount = new Set(
          reviews
            .map(reviewIdentity)
            .filter((identity) => !all.has(identity))
        ).size;
        if (newReviewCount > bestTerminalNewReviews) {
          bestTerminalPage = page;
          bestTerminalNewReviews = newReviewCount;
        }

        const target = reviewTarget(
          maxReviews,
          placeInfo,
          options.expectedReviewCount
        );
        const terminal = reviews.length === 0 || !page.pagination?.next_page_token;
        const premature = terminal && all.size + newReviewCount < target;

        if (!premature) {
          acceptedPage = page;
          break;
        }

        if (retry < prematureEndRetries && retryDelayMs > 0) {
          await sleep(retryDelayMs * 2 ** retry);
        }
      }

      const page = acceptedPage ?? bestTerminalPage ?? {};
      fetchedPages += 1;
      pagesThisPass += 1;

      const reviews = page.reviews ?? [];
      const sizeBeforePage = all.size;
      for (const review of reviews) {
        all.set(reviewIdentity(review), review);
      }
      const newReviewCount = all.size - sizeBeforePage;
      const nextPageToken = page.pagination?.next_page_token;
      pageDiagnostics.push({
        pass,
        page: fetchedPages,
        reviewCount: reviews.length,
        newReviewCount,
        attempts: pageAttempts,
        hasNextPageToken: Boolean(nextPageToken),
        identifier: requestDataId ? 'data_id' : 'place_id',
      });

      const target = reviewTarget(
        maxReviews,
        placeInfo,
        options.expectedReviewCount
      );
      if (all.size >= target) {
        stopReason = 'target_reached';
        break;
      }

      if (reviews.length === 0) {
        stopReason = 'empty_page';
        break;
      }

      pageToken = nextPageToken;
      if (!pageToken) {
        stopReason = 'missing_next_page_token';
        break;
      }

      if (seenPageTokens.has(pageToken)) {
        stopReason = 'repeated_page_token';
        break;
      }
      seenPageTokens.add(pageToken);

      // Deduplication means a broken API could otherwise return unlimited
      // duplicate pages under ever-changing tokens. Allow one overlap page,
      // then restart the bounded chain.
      const maxPagesThisPass =
        Math.ceil(
          reviewTarget(maxReviews, placeInfo, options.expectedReviewCount) /
            PAGE_SIZE
        ) + 1;
      if (pagesThisPass >= maxPagesThisPass) {
        stopReason = 'page_limit_reached';
        break;
      }
    }

    const target = reviewTarget(
      maxReviews,
      placeInfo,
      options.expectedReviewCount
    );
    if (all.size >= target) break;

    if (all.size === reviewsBeforePass) stagnantPasses += 1;
    else stagnantPasses = 0;

    if (stagnantPasses >= maxStagnantPasses) {
      stopReason = 'no_new_reviews';
      break;
    }
  }

  const targetReviews = reviewTarget(
    maxReviews,
    placeInfo,
    options.expectedReviewCount
  );
  const sliced = Array.from(all.values()).slice(0, maxReviews);

  return {
    reviews: sliced,
    place_info: placeInfo,
    dataId: resolvedDataId,
    fetchedPages,
    requestsMade,
    targetReviews,
    complete: sliced.length >= targetReviews,
    stopReason,
    pageDiagnostics,
  };
}
