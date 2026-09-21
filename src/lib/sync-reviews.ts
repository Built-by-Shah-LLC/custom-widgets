import { fetchAllScrapeDoReviews } from './scrapedo';
import { supabase } from './db';
import { mapReviewRow, type ApiReview } from './widget-mappers';

export interface SyncResult {
  businessId: string;
  businessName: string;
  placeId: string;
  pagesFetched: number;
  reviewsStored: number;
  totalReviews: number | null;
  averageRating: number | null;
  widgetsUpdated: number;
  widgetIds: string[];
  reviewsFetched: number;
  targetReviews: number;
  complete: boolean;
  stopReason: string;
  requestsMade: number;
  pageDiagnostics: Array<{
    page: number;
    reviewCount: number;
    attempts: number;
    hasNextPageToken: boolean;
    identifier: 'data_id' | 'place_id';
  }>;
  reviews: ApiReview[];
  syncedAt: string;
}

/**
 * Fetches reviews from Scrape.do and stores them in Supabase.
 *
 * This is the ONLY place Scrape.do is called. The app (editor, embed script,
 * reviews endpoint) always reads from Supabase; refresh cadence is a
 * separate decision (manual trigger now, cron later).
 */
export async function syncBusinessReviews(
  placeId: string,
  maxReviews = 40
): Promise<SyncResult> {
  const token = process.env.SCRAPEDO_TOKEN;
  if (!token) throw new Error('SCRAPEDO_TOKEN not configured');

  // 1. Resolve the managed business
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, name, place_id, scrapedo_data_id, total_reviews, average_rating')
    .eq('place_id', placeId)
    .single();

  if (businessError || !business) {
    throw new Error(`No managed business found for place_id ${placeId}`);
  }

  // 2. Fetch from Scrape.do (paginated, up to 20 reviews per request).
  // Sync newest-first so a one-page refresh always captures the latest reviews.
  const {
    reviews,
    place_info,
    dataId,
    fetchedPages,
    requestsMade,
    targetReviews,
    complete,
    stopReason,
    pageDiagnostics,
  } = await fetchAllScrapeDoReviews(placeId, token, maxReviews, 'newest', {
    dataId: business.scrapedo_data_id,
    expectedReviewCount: business.total_reviews,
  });

  console.info('[reviews-sync] Scrape.do pagination completed', {
    businessId: business.id,
    placeId,
    targetReviews,
    reviewsFetched: reviews.length,
    fetchedPages,
    requestsMade,
    complete,
    stopReason,
    pageDiagnostics,
  });

  // 3. Upsert the fetched page. Never delete the existing snapshot: review IDs
  // are stable, so refreshes update known rows and insert only new ones.
  const deduped = new Map(
    reviews.map((r) => [
      r.review_id ?? `${business.id}|${r.user?.name ?? 'anon'}|${r.date ?? ''}|${(r.snippet ?? '').slice(0, 40)}`,
      r,
    ])
  );

  const rows = Array.from(deduped.entries()).map(([key, r]) => ({
    business_id: business.id,
    google_review_id: r.review_id ?? key,
    author_name: r.user?.name ?? 'Anonymous',
    author_photo_url: r.user?.thumbnail ?? null,
    rating: r.rating ?? 0,
    text: r.snippet ?? '',
    relative_time: r.date ?? '',
    images: r.images ?? [],
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from('reviews')
      .upsert(rows, { onConflict: 'google_review_id' });
    if (upsertError) throw new Error(`Review upsert failed: ${upsertError.message}`);
  }

  const { data: storedRows, error: storedReviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', business.id);

  if (storedReviewsError) {
    throw new Error(`Stored reviews read failed: ${storedReviewsError.message}`);
  }

  const storedById = new Map(
    (storedRows ?? []).map((row) => [row.google_review_id as string, row])
  );
  const fetchedIds = new Set(rows.map((row) => row.google_review_id));
  const orderedStoredRows = [
    ...rows.flatMap((row) => {
      const stored = storedById.get(row.google_review_id);
      return stored ? [stored] : [];
    }),
    ...(storedRows ?? []).filter((row) => !fetchedIds.has(row.google_review_id)),
  ];

  // 4. Update business figures from Google
  const totalReviews = place_info?.reviews ?? business.total_reviews ?? null;
  const averageRating = place_info?.rating ?? business.average_rating ?? null;
  const syncedAt = new Date().toISOString();

  const { error: businessUpdateError } = await supabase
    .from('businesses')
    .update({
      ...(dataId ? { scrapedo_data_id: dataId } : {}),
      total_reviews: totalReviews,
      average_rating: averageRating,
      review_sync_status: complete ? 'complete' : 'partial',
      review_sync_target: targetReviews,
      review_sync_fetched: rows.length,
      review_sync_stop_reason: stopReason,
      review_sync_diagnostics: {
        fetchedPages,
        requestsMade,
        pages: pageDiagnostics,
      },
      reviews_last_synced_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq('id', business.id);

  if (businessUpdateError) {
    throw new Error(`Business sync update failed: ${businessUpdateError.message}`);
  }

  // 5. Snapshot into each widget's cached_reviews for the embed script
  // (both the badge and the carousel read from this cache)
  const cached = orderedStoredRows.map(mapReviewRow);

  const { data: updatedWidgets, error: widgetUpdateError } = await supabase
    .from('widgets')
    .update({
      cached_reviews: cached,
      last_synced_at: syncedAt,
    })
    .eq('business_id', business.id)
    .in('widget_type', ['google_reviews', 'google_reviews_carousel'])
    .select('id');

  if (widgetUpdateError) {
    throw new Error(`Widget review cache update failed: ${widgetUpdateError.message}`);
  }

  return {
    businessId: business.id,
    businessName: business.name,
    placeId,
    pagesFetched: fetchedPages,
    reviewsStored: cached.length,
    totalReviews,
    averageRating,
    widgetsUpdated: updatedWidgets?.length ?? 0,
    widgetIds: (updatedWidgets ?? []).map((widget) => widget.id),
    reviewsFetched: rows.length,
    targetReviews,
    complete,
    stopReason,
    requestsMade,
    pageDiagnostics,
    reviews: cached,
    syncedAt,
  };
}
