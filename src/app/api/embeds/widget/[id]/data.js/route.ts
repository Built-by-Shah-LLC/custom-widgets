import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  AllowedDomainsUnavailableError,
  getAllowedDomains,
  getRequestOrigin,
  isOriginAllowed,
} from '@/lib/domain-utils';
import { WIDGET_SELECT_WITH_REVIEWS } from '@/lib/widget-queries';
import {
  buildBeforeAfterPayload,
  buildFormPayload,
  buildReviewsPayload,
  safeJsString,
} from '@/lib/widget-public-payload';
import { WIDGET_NO_STORE_HEADERS, publicWidgetDataHeaders } from '@/lib/cache-headers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The function still runs on a cache miss. Successful bodies are stored on
// Vercel for 24h under widget-<id>. Errors stay no-store.
export const dynamic = 'force-dynamic';

function noStoreHeaders(extra: Record<string, string> = {}) {
  return { ...WIDGET_NO_STORE_HEADERS, ...extra };
}

function unavailableResponse() {
  return new NextResponse('Widget access policy unavailable', {
    status: 503,
    headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
  });
}

/**
 * Public bootstrap. It remains a synchronous assignment for old bundles, and
 * emits an additive readiness event for the current shared runtime.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return new NextResponse('Invalid widget id', {
      status: 400,
      headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const origin = getRequestOrigin(request);
  // Old snippets may omit referrer data. When a caller supplies an origin or
  // referrer, it must still be present in the configured allowlist.
  const allowlistPromise = getAllowedDomains();
  const payloadPromise = Promise.all([
    supabase
      .from('widgets')
      .select(WIDGET_SELECT_WITH_REVIEWS)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('before_after_widgets')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('form_widgets')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
  ]);

  let allowedDomains: string[];
  let results: Awaited<typeof payloadPromise>;
  try {
    // Allowlist and payload work can overlap, but admission is checked before
    // any payload branch is returned to the caller.
    [allowedDomains, results] = await Promise.all([
      allowlistPromise,
      payloadPromise,
    ]);
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return unavailableResponse();
    }
    return new NextResponse('Widget data unavailable', {
      status: 503,
      headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  if (origin && !isOriginAllowed(origin, allowedDomains)) {
    return new NextResponse('Origin not allowed', {
      status: 403,
      headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const [widgetResult, beforeAfterResult, formResult] = results;
  let payload:
    | ReturnType<typeof buildReviewsPayload>
    | ReturnType<typeof buildBeforeAfterPayload>
    | ReturnType<typeof buildFormPayload>;

  if (!widgetResult.error && widgetResult.data) {
    payload = buildReviewsPayload(widgetResult.data as Record<string, unknown>);
  } else if (!beforeAfterResult.error && beforeAfterResult.data) {
    payload = buildBeforeAfterPayload(
      beforeAfterResult.data as Record<string, unknown>
    );
  } else if (!formResult.error && formResult.data) {
    payload = buildFormPayload(formResult.data as Record<string, unknown>);
  } else {
    if (widgetResult.error || beforeAfterResult.error || formResult.error) {
      return new NextResponse('Widget data unavailable', {
        status: 503,
        headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
      });
    }
    return new NextResponse('Widget not found', {
      status: 404,
      headers: noStoreHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }

  const apiOrigin = new URL(request.url).origin;
  const serializedOrigin = safeJsString(apiOrigin);
  const serializedId = safeJsString(id);
  const serializedPayload = safeJsString(payload);
  const body =
    `window.__BBS_WIDGET_DATA_BY_ORIGIN__=window.__BBS_WIDGET_DATA_BY_ORIGIN__||{};` +
    `window.__BBS_WIDGET_DATA_BY_ORIGIN__[${serializedOrigin}]=window.__BBS_WIDGET_DATA_BY_ORIGIN__[${serializedOrigin}]||{};` +
    `window.__BBS_WIDGET_DATA_BY_ORIGIN__[${serializedOrigin}][${serializedId}]=${serializedPayload};` +
    `window.__BBS_WIDGET_DATA__=window.__BBS_WIDGET_DATA__||{};` +
    `window.__BBS_WIDGET_DATA__[${serializedId}]=window.__BBS_WIDGET_DATA_BY_ORIGIN__[${serializedOrigin}][${serializedId}];` +
    `window.dispatchEvent(new CustomEvent("bbs:widget-data-ready",{detail:{id:${serializedId},origin:${serializedOrigin}}}));`;

  return new NextResponse(body, {
    headers: {
      // No Vary: the body is identical for every dealer, and ACAO is *.
      // One Washington GET after a save fills this URL for every site on that edge.
      ...publicWidgetDataHeaders(id),
      'Content-Type': 'application/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
