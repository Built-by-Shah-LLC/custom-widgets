import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { reportCritical } from '@/lib/alerts';
import { NO_STORE_HEADERS, cachedPublicJsonHeaders } from '@/lib/cache-headers';
import { WIDGET_SELECT } from '@/lib/widget-queries';
import { mapReviewRow } from '@/lib/widget-mappers';
import { requireAdmin } from '@/lib/require-admin';
import {
  publicWidgetNotFound,
  publicWidgetPreflight,
  publicWidgetReadAccess,
  publicWidgetUnavailable,
} from '@/lib/public-widget-access';
import { deletedResponse, jsonSaved, publishEmbedWidgets } from '@/lib/widget-publication';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    .select(WIDGET_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) return publicWidgetUnavailable(access.corsHeaders);
  if (!data) return publicWidgetNotFound(access.corsHeaders);

  return NextResponse.json(data, {
    headers: cachedPublicJsonHeaders(access.corsHeaders, id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();

  // Prevent identity tampering (business_id is allowed: editors can
  // re-point a widget at a different business)
  delete body.id;
  delete body.created_at;

  // When (re)assigning a business, refresh the cached reviews so embeds
  // don't keep serving the previous business's reviews. The canonical
  // review mapping lives in mapReviewRow (shared with the data.js route).
  if (body.business_id) {
    const { data: reviewRows } = await supabase
      .from('reviews')
      .select('*')
      .eq('business_id', body.business_id);

    body.cached_reviews = (reviewRows ?? []).map(mapReviewRow);
  }

  const { data, error } = await supabase
    .from('widgets')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    await reportCritical({
      title: 'Widget update failed',
      message: error.message,
      fingerprint: `widget-update-failed:${id}`,
    });
    return NextResponse.json(
      { error: 'Update failed', message: error.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return jsonSaved(data, await publishEmbedWidgets(request, [id]));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;

  const { error } = await supabase.from('widgets').delete().eq('id', id);

  if (error) {
    await reportCritical({
      title: 'Widget delete failed',
      message: error.message,
      fingerprint: `widget-delete-failed:${id}`,
    });
    return NextResponse.json(
      { error: 'Delete failed', message: error.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return deletedResponse(await publishEmbedWidgets(request, [id]));
}
