import { NextResponse } from 'next/server';
import { WIDGET_NO_STORE_HEADERS } from './cache-headers';
import {
  AllowedDomainsUnavailableError,
  getAllowedDomains,
  getWidgetCorsHeaders,
} from './domain-utils';

function unavailable() {
  return NextResponse.json(
    { error: 'Widget access policy unavailable' },
    { status: 503, headers: WIDGET_NO_STORE_HEADERS }
  );
}

export async function publicWidgetPreflight(request: Request): Promise<NextResponse> {
  try {
    const allowedDomains = await getAllowedDomains();
    const cors = getWidgetCorsHeaders(request, allowedDomains);
    return new NextResponse(null, {
      status: cors.allowed ? 204 : 403,
      headers: { ...cors.headers, ...WIDGET_NO_STORE_HEADERS },
    });
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) return unavailable();
    throw error;
  }
}

export async function publicWidgetReadAccess(request: Request): Promise<
  | { ok: true; corsHeaders: Record<string, string> }
  | { ok: false; response: NextResponse }
> {
  try {
    const allowedDomains = await getAllowedDomains();
    const cors = getWidgetCorsHeaders(request, allowedDomains);
    if (!cors.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Origin not allowed' },
          { status: 403, headers: { ...cors.headers, ...WIDGET_NO_STORE_HEADERS } }
        ),
      };
    }
    return { ok: true, corsHeaders: cors.headers };
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return { ok: false, response: unavailable() };
    }
    throw error;
  }
}

export function publicWidgetUnavailable(corsHeaders: Record<string, string>) {
  return NextResponse.json(
    { error: 'Widget data unavailable' },
    { status: 503, headers: { ...corsHeaders, ...WIDGET_NO_STORE_HEADERS } }
  );
}

export function publicWidgetNotFound(corsHeaders: Record<string, string>) {
  return NextResponse.json(
    { error: 'Widget not found' },
    { status: 404, headers: { ...corsHeaders, ...WIDGET_NO_STORE_HEADERS } }
  );
}
