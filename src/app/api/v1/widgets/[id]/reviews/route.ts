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
import { mapReviewRow } from '@/lib/widget-mappers';

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
    .select('cached_reviews')
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

  return NextResponse.json(
    {
      reviews: Array.isArray(data.cached_reviews)
        ? data.cached_reviews.map(mapReviewRow)
        : [],
    },
    { headers: { ...cors.headers, ...WIDGET_DATA_CACHE_HEADERS } }
  );
}
