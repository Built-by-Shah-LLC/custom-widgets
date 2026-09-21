import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  AllowedDomainsUnavailableError,
  getAllowedDomains,
  getWidgetCorsHeaders,
} from '@/lib/domain-utils';
import {
  WIDGET_NO_STORE_HEADERS,
  WIDGET_DATA_CACHE_HEADERS,
} from '@/lib/cache-headers';
import { publicFormResponse } from '@/lib/widget-public-payload';
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
        { status: 404, headers: WIDGET_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(data, { headers: WIDGET_NO_STORE_HEADERS });
  }

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
    .from('form_widgets')
    .select('*')
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

  return NextResponse.json(publicFormResponse(data), {
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

  const { error } = await supabase
    .from('form_widgets')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: 'Delete failed', message: error.message },
      { status: 500, headers: WIDGET_NO_STORE_HEADERS }
    );
  }

  return new NextResponse(null, { status: 204, headers: WIDGET_NO_STORE_HEADERS });
}
