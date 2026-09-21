import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { supabase } from '@/lib/db';
import { mapReviewRow } from '@/lib/widget-mappers';
import { listReviewWidgetIdsForBusiness } from '@/lib/embed-widget-ids';
import { laggingCache, type LiveCacheResult } from '@/lib/live-cache-warning';
import { jsonSaved, publishEmbedWidgets } from '@/lib/widget-publication';

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();
  if (!body.placeId || !body.name) {
    return NextResponse.json({ error: 'A Google place ID and business name are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('businesses')
    .upsert({
      place_id: body.placeId,
      ...(typeof body.dataId === 'string' && body.dataId
        ? { scrapedo_data_id: body.dataId }
        : {}),
      name: body.name,
      address: body.address ?? '',
      average_rating: Number(body.averageRating ?? 0),
      total_reviews: Number(body.totalReviews ?? 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'place_id' })
    .select('id, name, address, average_rating, total_reviews, place_id, scrapedo_data_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reviewsResult = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', data.id);
  const reviewRows = reviewsResult.data;

  if (reviewsResult.error) {
    return NextResponse.json({ error: reviewsResult.error.message }, { status: 500 });
  }

  const { data: refreshedBusiness } = await supabase
    .from('businesses')
    .select('id, name, address, average_rating, total_reviews, place_id, scrapedo_data_id')
    .eq('id', data.id)
    .single();
  const business = refreshedBusiness ?? data;

  let cache: LiveCacheResult;
  try {
    cache = await publishEmbedWidgets(
      request,
      await listReviewWidgetIdsForBusiness(business.id)
    );
  } catch {
    cache = laggingCache();
  }

  return jsonSaved({
    id: business.id,
    placeId: business.place_id,
    dataId: business.scrapedo_data_id,
    name: business.name,
    address: business.address ?? '',
    averageRating: Number(business.average_rating),
    totalReviews: business.total_reviews,
    reviews: (reviewRows ?? []).map(mapReviewRow),
    hasReviews: (reviewRows?.length ?? 0) > 0,
  }, cache);
}
