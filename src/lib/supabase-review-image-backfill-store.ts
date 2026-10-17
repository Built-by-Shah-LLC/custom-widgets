import { supabase } from './db';
import {
  replaceWidgetCachedReviewImages,
  type HistoricalReviewRow,
  type ReviewImageBackfillStore,
  type ReviewImageBusinessRow,
} from './review-image-backfill';
import { uploadVerifiedReviewImage } from './verified-review-image-upload';

const PAGE_SIZE = 1_000;

async function listReviews(businessId: string): Promise<HistoricalReviewRow[]> {
  const rows: HistoricalReviewRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, business_id, google_review_id, author_name, author_photo_url, rating, text, relative_time, images')
      .eq('business_id', businessId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as HistoricalReviewRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function createSupabaseReviewImageBackfillStore(): ReviewImageBackfillStore {
  return {
    async getBusiness(businessId) {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, place_id')
        .eq('id', businessId)
        .single();
      if (error || !data) throw new Error(error?.message ?? `Business ${businessId} not found`);
      return data as ReviewImageBusinessRow;
    },

    listReviews,
    uploadReviewImage: uploadVerifiedReviewImage,

    async updateReviewImages({ businessId, reviewRowId, images }) {
      const { data, error } = await supabase
        .from('reviews')
        .update({ images })
        .eq('id', reviewRowId)
        .eq('business_id', businessId)
        .select('id');
      if (error) throw new Error(error.message);
      if (data?.length !== 1) throw new Error(`Review ${reviewRowId} was not updated`);
    },

    async updateWidgetCaches({ businessId, reviews }) {
      const { data: widgets, error: widgetsError } = await supabase
        .from('widgets')
        .select('id, cached_reviews')
        .eq('business_id', businessId)
        .in('widget_type', ['google_reviews', 'google_reviews_carousel']);
      if (widgetsError) throw new Error(widgetsError.message);

      const widgetIds: string[] = [];
      for (const widget of widgets ?? []) {
        const replacement = replaceWidgetCachedReviewImages(widget.cached_reviews, reviews);
        if (!replacement.changed) continue;
        const { data, error } = await supabase
          .from('widgets')
          .update({ cached_reviews: replacement.cachedReviews })
          .eq('id', widget.id)
          .eq('business_id', businessId)
          .select('id');
        if (error) throw new Error(error.message);
        if (data?.length !== 1) throw new Error(`Widget ${widget.id} was not updated`);
        widgetIds.push(widget.id);
      }
      return widgetIds;
    },
  };
}
