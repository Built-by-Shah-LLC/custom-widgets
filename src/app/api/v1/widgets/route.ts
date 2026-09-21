import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { NO_STORE_HEADERS } from '@/lib/cache-headers';
import { requireAdmin } from '@/lib/require-admin';
import { mapReviewRow } from '@/lib/widget-mappers';
import { jsonSaved, publishEmbedWidgets } from '@/lib/widget-publication';

export const maxDuration = 60;

// Creates a Google Reviews widget (used by the home-page modal for
// duplicate — new widgets normally come from scripts/add-business.mjs).
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json();

  // Never trust client-supplied identity fields or the joined relation
  delete body.id;
  delete body.created_at;
  delete body.updated_at;
  delete body.businesses;

  if (!body.business_id) {
    return NextResponse.json(
      { error: 'Create failed', message: 'business_id is required' },
      { status: 400 }
    );
  }

  // The editor may have just fetched reviews before this widget exists, so
  // build the new widget cache from the normalized business reviews here.
  // Never trust a client-provided cached_reviews payload.
  const { data: reviewRows, error: reviewsError } = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', body.business_id);

  if (reviewsError) {
    return NextResponse.json(
      { error: 'Create failed', message: reviewsError.message },
      { status: 500 }
    );
  }

  body.cached_reviews = (reviewRows ?? []).map(mapReviewRow);
  body.last_synced_at = body.cached_reviews.length > 0 ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('widgets')
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Create failed', message: error.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return jsonSaved(data, await publishEmbedWidgets(request, [data.id]), 201);
}
