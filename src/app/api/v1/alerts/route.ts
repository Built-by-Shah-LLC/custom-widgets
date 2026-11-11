import { NextResponse } from 'next/server';
import { reportCritical } from '@/lib/alerts';
import { clientIp, createRateLimiter } from '@/lib/rate-limit';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateLimited = createRateLimiter({
  windowMs: RATE_WINDOW_MS,
  maxHits: RATE_MAX,
});

/**
 * Public (rate-limited) intake for client/embed catastrophic failures.
 * Admin sessions bypass the size/severity checks less strictly but still
 * go through reportCritical. Never emails routine 401/403 noise — callers
 * must only POST true critical events.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const auth = await requireAdmin();
  const isAdmin = !auth.error;

  if (!isAdmin && rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: {
    title?: string;
    message?: string;
    fingerprint?: string;
    meta?: Record<string, unknown>;
    severity?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title ?? '').trim().slice(0, 200);
  const message = (body.message ?? '').trim().slice(0, 4000);
  if (!title || !message) {
    return NextResponse.json(
      { error: 'title and message are required' },
      { status: 400 }
    );
  }

  // Public callers may only report critical severity.
  if (!isAdmin && body.severity && body.severity !== 'critical') {
    return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
  }

  const result = await reportCritical({
    title,
    message,
    fingerprint: body.fingerprint?.slice(0, 120),
    meta: {
      ...(body.meta ?? {}),
      source: isAdmin ? 'admin-client' : 'public-client',
      ip,
    },
  });

  return NextResponse.json(result, { status: 202 });
}
