import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { NO_STORE_HEADERS } from '@/lib/cache-headers';
import {
  AllowedDomainsUnavailableError,
  getAllowedDomains,
  getRequestOrigin,
  isOriginAllowed,
} from '@/lib/domain-utils';
import {
  computeSlower,
  isValidWidgetId,
  parseDurationMs,
  parseOk,
  parseTimingHost,
  timingHostMatchesCaller,
} from '@/lib/widget-timing';
import { clientIp, createRateLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateLimited = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxHits: RATE_MAX,
});

function noStore(status: number, body?: Record<string, string>) {
  if (body) {
    return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
  }
  return new NextResponse(null, { status, headers: NO_STORE_HEADERS });
}

/**
 * Public (rate-limited) intake for embed load timings.
 * Host must be on the allowed-domains list; no session required.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return noStore(429, { error: 'Too many requests' });
  }

  let body: unknown;
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {
    return noStore(400, { error: 'Invalid JSON' });
  }

  if (!body || typeof body !== 'object') {
    return noStore(400, { error: 'Invalid body' });
  }

  const record = body as Record<string, unknown>;
  const widgetId = record.widgetId;
  const host = parseTimingHost(record.host);
  const dataMs = parseDurationMs(record.dataMs);
  const rendererMs = parseDurationMs(record.rendererMs);
  const ok = parseOk(record.ok);

  if (
    !isValidWidgetId(widgetId) ||
    host === null ||
    dataMs === undefined ||
    rendererMs === undefined ||
    ok === undefined
  ) {
    return noStore(400, { error: 'Invalid input' });
  }

  let allowedDomains: string[];
  try {
    allowedDomains = await getAllowedDomains();
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return noStore(503, { error: 'Widget access policy unavailable' });
    }
    throw error;
  }

  // The body host must be the caller, and that caller must be allowlisted.
  const caller = getRequestOrigin(request);
  if (
    !timingHostMatchesCaller(host, caller) ||
    !isOriginAllowed(caller, allowedDomains)
  ) {
    return noStore(403, { error: 'Host not allowed' });
  }

  const slower = computeSlower(dataMs, rendererMs);

  const { error } = await supabase.from('widget_load_timings').insert({
    widget_id: widgetId,
    host,
    data_ms: dataMs,
    renderer_ms: rendererMs,
    ok,
    slower,
  });

  if (error) {
    return noStore(500, { error: 'Failed to store timing' });
  }

  return noStore(204);
}
