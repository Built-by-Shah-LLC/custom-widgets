import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { NO_STORE_HEADERS, cachedPublicJsonHeaders } from '@/lib/cache-headers';
import { publicFormResponse } from '@/lib/widget-public-payload';
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
  const url = new URL(request.url);
  // Admin tooling has a separate explicit read path. This query is never
  // treated as public and cannot accidentally receive the DTO below.
  if (url.searchParams.get('view') === 'admin') {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { data, error } = await supabase
      .from('form_widgets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: 'Widget not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  }

  const access = await publicWidgetReadAccess(request);
  if (!access.ok) return access.response;

  const { data, error } = await supabase
    .from('form_widgets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return publicWidgetUnavailable(access.corsHeaders);
  if (!data) return publicWidgetNotFound(access.corsHeaders);

  return NextResponse.json(publicFormResponse(data), {
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

  // Prevent id tampering
  delete body.id;
  delete body.created_at;

  const { data, error } = await supabase
    .from('form_widgets')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) {
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

  const { error } = await supabase
    .from('form_widgets')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: 'Delete failed', message: error.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return deletedResponse(await publishEmbedWidgets(request, [id]));
}
