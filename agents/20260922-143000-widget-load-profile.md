# Widget load profile — implementation plan

Diagnostic-only: one beacon per placeholder attempt with data.js / widget.js durations, ok/fail, and which file was slower. No charts, percentiles, cache math, pathnames, query strings, or IP storage in the table.

## 1. Timing-Allow-Origin on script responses

Add `Timing-Allow-Origin: *` on successful responses only:

- `src/app/api/embeds/widget/[id]/data.js/route.ts` (200 body)
- `src/app/api/embeds/widget.js/route.ts` (200 and 304)

Do not change cache lifetimes, cache tags, or purge behavior.

## 2. Embed runtime beacon

In `src/lib/embed-runtime.ts` (mount success / failure already live here):

- After mount success or failure, send one beacon (non-blocking).
- Prefer `navigator.sendBeacon`; fallback `fetch(..., { keepalive: true })`.
- Payload: `{ widgetId, host: location.hostname, dataMs, rendererMs, ok }`.
- `dataMs`: Resource Timing duration for URL containing `/api/embeds/widget/<id>/data.js`, else null.
- `rendererMs`: Resource Timing duration for URL ending `/api/embeds/widget.js` or `/widget.js`, else null.
- Once per placeholder attempt (flag on placeholder state).
- Bootstrap already times out ~10s (`BOOTSTRAP_TIMEOUT_MS`); that miss feeds existing failure paths — report `ok: false` there; do not invent a new loader.
- Legacy (no data.js): `dataMs` null, renderer if present, `ok` from mount.

POST to `${apiOrigin}/api/v1/widget-timing`.

## 3. Public API `POST /api/v1/widget-timing`

- Middleware: public POST skip like `/api/v1/alerts`.
- Validate UUID `widgetId`, bare hostname (no scheme/path), durations null or int 0..60000, `ok` boolean.
- Allowlist host via `getAllowedDomains` + same hostname rules as `isOriginAllowed` (incl. localhost flag).
- Rate-limit by IP like alerts.
- Insert via service-role Supabase (`@/lib/db`).
- Server computes `slower`: null if either ms null; else `data` or `renderer`.
- 204 + no-store. 400 invalid, 403 disallowed host (both no-store). No cache.

## 4. Migration `019_widget_load_timings.sql`

Table `widget_load_timings` as specified. RLS enabled, no policies (service-role only). No FKs.

## 5. Settings “Recent loads”

Under domain list on Settings: latest 100 rows (when, widget id, site, data ms, renderer ms, result, slower). Server-load in `src/app/settings/page.tsx`, render in `SettingsPage`. No new nav/charts/filters.

## 6. Tests

Unit-test hostname/duration validation and slower-file rule without Supabase (vitest, existing style).

## Out of scope

Commit/push; cache purge/TTL/tags beyond Timing-Allow-Origin; analytics product expansions.
