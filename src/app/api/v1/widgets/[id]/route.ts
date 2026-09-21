import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { reportCritical } from '@/lib/alerts';
import {
  AllowedDomainsUnavailableError,
  getAllowedDomains,
  getWidgetCorsHeaders,
} from '@/lib/domain-utils';
import {
  WIDGET_NO_STORE_HEADERS,
  WIDGET_DATA_CACHE_HEADERS,
} from '@/lib/cache-headers';
import { WIDGET_SELECT } from '@/lib/widget-queries';
import { mapReviewRow } from '@/lib/widget-mappers';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  let allowedDomains: string[];
  try {
    allowedDomains = await getAllowedDomains();
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return NextResponse.json(
        { error: 'Widget access policy unavailable' },
        { status: 503, headers: WIDGET_NO_STORE_HEADERS }
      );
    }
    throw error;
  }
  const cors = getWidgetCorsHeaders(request, allowedDomains);

  return new NextResponse(null, {
    status: cors.allowed ? 204 : 403,
    headers: cors.allowed
      ? { ...cors.headers, ...WIDGET_NO_STORE_HEADERS }
      : { ...cors.headers, ...WIDGET_NO_STORE_HEADERS },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let allowedDomains: string[];
  try {
    allowedDomains = await getAllowedDomains();
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return NextResponse.json(
        { error: 'Widget access policy unavailable' },
        { status: 503, headers: WIDGET_NO_STORE_HEADERS }
      );
    }
    throw error;
  }
  const cors = getWidgetCorsHeaders(request, allowedDomains);

  if (!cors.allowed) {
    return NextResponse.json(
      { error: 'Origin not allowed' },
      { status: 403, headers: { ...cors.headers, ...WIDGET_NO_STORE_HEADERS } }
    );
  }

  const { data, error } = await supabase
    .from('widgets')
    .select(WIDGET_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: 'Widget data unavailable' },
      { status: 503, headers: { ...cors.headers, ...WIDGET_NO_STORE_HEADERS } }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Widget not found' },
      { status: 404, headers: { ...cors.headers, ...WIDGET_NO_STORE_HEADERS } }
    );
  }

  return NextResponse.json(data, {
    headers: { ...cors.headers, ...WIDGET_DATA_CACHE_HEADERS },
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
      { status: 500, headers: WIDGET_NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(data, { headers: WIDGET_NO_STORE_HEADERS });
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
      { status: 500, headers: WIDGET_NO_STORE_HEADERS }
    );
  }

  return new NextResponse(null, { status: 204, headers: WIDGET_NO_STORE_HEADERS });
}
