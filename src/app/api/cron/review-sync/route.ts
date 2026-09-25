import { NextResponse } from 'next/server';
import { reportCritical } from '@/lib/alerts';
import { runStaleReviewSync } from '@/lib/review-sync-scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOG_PREFIX = '[cron:review-sync]';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Vercel Cron entry point for the weekly review-image refresh. Vercel Cron
 * automatically attaches `Authorization: Bearer ${CRON_SECRET}` when the
 * CRON_SECRET env var exists, so the secret is the entire auth model. The
 * schedule (daily, stalest-first, time-boxed) guarantees every business is
 * refreshed within ~7 days — well inside Google's ~30-day image-URL expiry —
 * because a single invocation cannot cover the whole fleet within the
 * function time ceiling.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    // Fail closed: without the secret there is nothing to verify against.
    console.error(LOG_PREFIX, 'CRON_SECRET is not configured; refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 401 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await runStaleReviewSync();
    console.info(LOG_PREFIX, 'batch complete', report);

    // A fully-failed batch means a systemic cause (scrape.do outage, missing
    // SCRAPEDO_TOKEN), not per-business flakiness — that must page someone,
    // otherwise a silently broken cron repeats for weeks.
    if (report.attempted > 0 && report.succeeded === 0) {
      const firstError = report.failed[0]?.error ?? 'unknown';
      await reportCritical({
        title: 'Review sync cron: total batch failure',
        message:
          `${report.attempted} businesses were attempted in the review sync cron and all failed. ` +
          `First error: ${firstError}. Widget review images will expire (~30 days) if this persists.`,
        fingerprint: 'review-sync-cron-total-failure',
        meta: {
          attempted: report.attempted,
          failedNames: report.failed.map((failure) => failure.name).slice(0, 10),
        },
      });
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(LOG_PREFIX, 'unexpected failure', { message });
    return NextResponse.json({ error: 'Cron sync failed', message }, { status: 500 });
  }
}
