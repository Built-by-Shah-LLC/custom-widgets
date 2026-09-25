import { supabase } from './db';
import { syncBusinessReviews } from './sync-reviews';

const GOOGLE_REVIEWS_WIDGET_TYPES = ['google_reviews', 'google_reviews_carousel'];
const DAY_MS = 86_400_000;

const DEFAULT_MIN_AGE_DAYS = 6;
const DEFAULT_MAX_BUSINESSES = 100;
const DEFAULT_BUDGET_MS = 180_000;
const DEFAULT_DELAY_MS = 1_500;
const DEFAULT_MAX_REVIEWS = 40;
const MAX_ERROR_MESSAGE_LENGTH = 500;

export interface SyncFailure {
  placeId: string;
  name: string;
  error: string;
}

export interface SyncBatchReport {
  attempted: number;
  succeeded: number;
  failed: SyncFailure[];
  elapsedMs: number;
  /** Eligible businesses that were not attempted (time-box or selection cap). */
  remaining: number;
}

export interface SchedulerOptions {
  /** Only businesses whose last sync is older than this are eligible. */
  minAgeDays?: number;
  /** Hard cap on how many businesses one run may select. */
  maxBusinesses?: number;
  /** Stop starting new syncs once elapsed time exceeds this. */
  budgetMs?: number;
  /** Reviews fetched per business (URL refresh coverage). Env-overridable. */
  maxReviews?: number;
  /** Politeness delay between businesses (scrape.do rate courtesy). */
  delayMs?: number;
  supabaseClient?: typeof supabase;
  sync?: typeof syncBusinessReviews;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function truncateError(message: string): string {
  return message.replace(/\s+/g, ' ').slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

/**
 * Google signs scraped review-photo URLs with a signature that expires
 * (~28–30 days), so freshness is a rolling deadline, not a one-off fix. This
 * scheduler keeps every widget-carrying business inside that window: it picks
 * the stalest businesses first, syncs them within a single-invocation time
 * budget, and relies on frequent cron invocations to converge. Businesses
 * without a live Google-reviews widget are skipped — their photos render
 * nowhere, so refreshing them only burns scrape.do credits.
 */
export async function runStaleReviewSync(options: SchedulerOptions = {}): Promise<SyncBatchReport> {
  const {
    minAgeDays = DEFAULT_MIN_AGE_DAYS,
    maxBusinesses = DEFAULT_MAX_BUSINESSES,
    budgetMs = DEFAULT_BUDGET_MS,
    maxReviews = Number(process.env.CRON_SYNC_MAX_REVIEWS) || DEFAULT_MAX_REVIEWS,
    delayMs = DEFAULT_DELAY_MS,
    supabaseClient = supabase,
    sync = syncBusinessReviews,
    sleep = defaultSleep,
    now = Date.now,
  } = options;

  const cutoff = new Date(now() - minAgeDays * DAY_MS).toISOString();
  const staleFilter = `reviews_last_synced_at.is.null,reviews_last_synced_at.lt.${cutoff}`;

  const selectionQuery = supabaseClient
    .from('businesses')
    .select('id, name, place_id, reviews_last_synced_at, widgets!inner(id)')
    .in('widgets.widget_type', GOOGLE_REVIEWS_WIDGET_TYPES)
    .or(staleFilter)
    .order('reviews_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(maxBusinesses);

  const countQuery = supabaseClient
    .from('businesses')
    .select('id', { count: 'exact', head: true })
    .in('widgets.widget_type', GOOGLE_REVIEWS_WIDGET_TYPES)
    .or(staleFilter);

  const [selection, countResult] = await Promise.all([selectionQuery, countQuery]);

  if (selection.error) {
    throw new Error(`Stale business selection failed: ${selection.error.message}`);
  }
  if (countResult.error) {
    throw new Error(`Eligible business count failed: ${countResult.error.message}`);
  }

  const businesses = (selection.data ?? []) as Array<{ name: string; place_id: string }>;
  const eligibleTotal = countResult.count ?? businesses.length;
  const failed: SyncFailure[] = [];
  let attempted = 0;
  let succeeded = 0;
  const startedAt = now();

  for (const business of businesses) {
    // Check before each business so an in-flight sync is never aborted,
    // keeping widget caches consistent per business.
    if (now() - startedAt > budgetMs) break;

    attempted += 1;
    try {
      await sync(business.place_id, maxReviews);
      succeeded += 1;
    } catch (error) {
      failed.push({
        placeId: business.place_id,
        name: business.name,
        error: truncateError(error instanceof Error ? error.message : String(error)),
      });
    }

    if (attempted < businesses.length) await sleep(delayMs);
  }

  const elapsedMs = now() - startedAt;
  return {
    attempted,
    succeeded,
    failed,
    elapsedMs,
    remaining: Math.max(0, eligibleTotal - attempted),
  };
}
