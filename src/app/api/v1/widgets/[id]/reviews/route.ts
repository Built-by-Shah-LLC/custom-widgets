import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { cachedPublicJsonHeaders } from '@/lib/cache-headers';
import { mapReviewRow } from '@/lib/widget-mappers';
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
    .select('cached_reviews')
    .eq('id', id)
    .maybeSingle();

  if (error) return publicWidgetUnavailable(access.corsHeaders);
  if (!data) return publicWidgetNotFound(access.corsHeaders);

  return NextResponse.json(
    {
      reviews: Array.isArray(data.cached_reviews)
        ? data.cached_reviews.map(mapReviewRow)
        : [],
    },
    { headers: cachedPublicJsonHeaders(access.corsHeaders, id) }
  );
}
