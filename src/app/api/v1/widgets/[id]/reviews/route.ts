import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { cachedPublicJsonHeaders } from '@/lib/cache-headers';
import { publicReviewList } from '@/lib/widget-public-payload';
import {
  publicWidgetNotFound,
  publicWidgetPreflight,
  publicWidgetReadAccess,
  publicWidgetUnavailable,
} from '@/lib/public-widget-access';

export const dynamic = 'force-dynamic';

export function OPTIONS(request: Request) {
  return publicWidgetPreflight(request);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await publicWidgetReadAccess(request);
  if (!access.ok) return access.response;

  const { data, error } = await supabase
    .from('widgets')
    .select('cached_reviews, min_rating, excluded_review_ids, image_filtering, sort_by, max_reviews')
    .eq('id', id)
    .maybeSingle();

  if (error) return publicWidgetUnavailable(access.corsHeaders);
  if (!data) return publicWidgetNotFound(access.corsHeaders);

  return NextResponse.json(
    { reviews: publicReviewList(data) },
    { headers: cachedPublicJsonHeaders(access.corsHeaders, id) }
  );
}
