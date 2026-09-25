# Weekly Review-Image Refresh Cron

**Date:** 2026-09-25
**Repo:** custom-widgets (BBS Widgets Software)
**Type:** Feature (ops automation)

## Intent

Google signs customer-attached review photo URLs (`lh3.googleusercontent.com/grass-cs/...`)
returned by scrape.do with a signature that dies **~28–30 days after issuance**
(empirically verified 2026-09-25: URLs 27.8d old → HTTP 206; 29.7d old → HTTP 403).
Review rows and widget `cached_reviews` only pick up fresh URLs when a sync runs.
Today syncs are manual-only (`sync-reviews.ts` header: "manual trigger now, cron later"),
so every business is on a rolling 30-day time bomb.

## Goal

Every business that has a live Google-reviews widget is re-synced **at least once per
week**, so no stored image URL ever ages past ~7 days — comfortably inside the 28-day
safety floor.

## Problem evidence

- 30 of 118 photo-carrying businesses had broken photos on 2026-09-25 (sync ages 29.7–43.9d).
- 96 businesses were mass re-synced 2026-09-24; without automation their photos die again ~2026-10-24.

## Benchmark

- 130 businesses, 254 widgets, ~17.4k reviews.
- One scrape.do sync per business ≈ 1–3 API requests (maxReviews=40, 20/page) + politeness delay.
- Worst-case full sweep ≈ 20+ min — **exceeds any single serverless invocation** (maxDuration 300s max on this stack).

## Proposed changes

### 1. `src/lib/review-sync-scheduler.ts` (new)

Time-boxed, stalest-first batch scheduler. Pure logic, fully unit-testable.

- **Selection:** businesses that have ≥1 widget of type `google_reviews` or
  `google_reviews_carousel` AND (`reviews_last_synced_at` IS NULL OR older than
  `minAgeDays` [default 6]) — ordered by `reviews_last_synced_at` ASC, NULLS FIRST.
  Businesses with no live reviews widgets are excluded (their photos render nowhere;
  saves API credits — e.g. Ferrari World's 817 orphaned photos).
- **Execution:** for each selected business, `syncBusinessReviews(place_id, maxReviews)`
  where `maxReviews` defaults to 40 and is env-overridable (`CRON_SYNC_MAX_REVIEWS`), with a
  1.5s delay between businesses (scrape.do politeness, matching
  `scripts/sync-all-reviews.ts`). Per-business try/catch — one failure never aborts
  the batch. (Note: a 40-newest fetch refreshes URLs for what widgets display by default;
  widgets with larger `max_reviews` keep serving their older stored rows untouched.)
- **Time-box:** stop scheduling new businesses once `elapsed > budgetMs`
  (default 180s — leaves headroom under the 300s function ceiling even when one
  pathological sync overruns) after the current business completes. Never abort
  mid-sync. Selection is additionally hard-capped (e.g. 100) as a second backstop.
- **Testability:** the scheduler takes its dependencies injected (supabase client,
  sync function, sleep, now) with production defaults, so unit tests are deterministic
  and never hit the network.
- **Report:** `{ attempted, succeeded, failed: [{ placeId, name, error }], elapsedMs }`.

### 2. `src/app/api/cron/review-sync/route.ts` (new)

- `export const maxDuration = 300; export const dynamic = 'force-dynamic';`
- **Auth:** require `Authorization: Bearer ${CRON_SECRET}`. This is the Vercel-documented
  pattern — Vercel Cron automatically sends this header when a `CRON_SECRET` env var
  exists. No session/admin auth (cron is unauthenticated by design; the secret is the auth).
  401 on missing/mismatch. **Fail closed: if `CRON_SECRET` is unset, every request gets 401**
  and the route logs a config warning. Never log the secret or the full inbound header.
- **Middleware admission:** `src/middleware.ts` 401s every `/api/*` path without an
  admin session unless explicitly allowlisted. `/api/cron/review-sync` (GET) must be added
  to the public-path checks (same pattern as the widget-timing beacon), otherwise Vercel
  Cron would be rejected before reaching the route.
- Calls the scheduler with the production budget, returns the JSON report (200).
- If every business failed (systemic cause: scrape.do outage, missing `SCRAPEDO_TOKEN`),
  send one `reportCritical` alert (existing `@/lib/alerts`, already has dedupe) so a
  silently-broken cron is not invisible for a week. Partial failures are logged, not emailed
  (per-business flakes are routine).

### 3. `vercel.json` (new)

```json
{
  "crons": [
    { "path": "/api/cron/review-sync", "schedule": "0 6 * * *" }
  ]
}
```

**Why daily 06:00 UTC and not Monday-only:** a single Monday run cannot cover 130
businesses within the 300s function ceiling (measured ≈10–15s per sync → 20+ min total).
Daily invocation with a 6-day eligibility gate and stalest-first ordering gives every
business a strict ≤7-day rolling refresh cycle — which satisfies "weekly Monday refresh"
in intent (every business refreshed about every week; Monday is when the largest batch
becomes eligible). First runs self-heal the current incident: the 30 affected businesses
are the stalest, so they are synced first, spread over the first 2–3 days of batches.

### 4. Tests

- `src/lib/review-sync-scheduler.test.ts`: selection ordering + NULLS FIRST, no-widget
  exclusion, min-age gate, per-business failure containment, time-box stop, delay respected.
- `src/app/api/cron/review-sync/route.test.ts`: 401 without/wrong bearer, 200 + scheduler
  invoked with correct secret, alert fired on total failure, no alert on partial failure.
- Follow existing vitest patterns (`route.test.ts` next to route; mocks for `@/lib/db`,
  `@/lib/sync-reviews`, `@/lib/alerts`).

### 5. Env / deployment notes (no code)

- `CRON_SECRET` must be set in the Vercel project (any strong random value); Vercel then
  auto-sends it on cron requests.
- No database migration. No change to `sync-reviews.ts` or the manual `/api/v1/sync` route.

## Out of scope

- Persisting photos to Supabase Storage (long-term durability fix) — separate ticket.
- Alerting on partial failure / per-business retry queue.
- Changing widget display logic or the image proxy.

## Acceptance criteria

1. `GET /api/cron/review-sync` with a valid bearer secret syncs eligible stalest-first
   businesses and returns a JSON report; unauthorized requests get 401.
2. With 130 stale businesses and a 210s budget, one invocation syncs a partial batch and
   stops cleanly; the next invocation continues with the next-stalest businesses.
3. One failing business does not stop the batch and does not fail the HTTP response.
4. `npm run lint`, `npm run test:unit`, and `npm run build` pass.

## Verification

1. Unit tests above (automated).
2. Manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/review-sync`
   after deploy — expect report with `succeeded > 0`.
3. Post-deploy: `reviews_last_synced_at` for all widget-carrying businesses stays < 8 days old.

## Release / rollback notes

- **Environment:** production (Vercel cron is production-only by default).
- **Risk:** scrape.do API credit consumption ≈ 30 requests/day average. Rollback = delete
  `vercel.json` or remove the cron entry (no data migration involved).
