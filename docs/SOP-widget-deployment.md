# SOP — Widget Deployment (BuiltByShah Custom Widgets)

**Owner:** Hassan
**Last updated:** 2026-09-21
**Repo:** `custom-widgets` (Next.js + Supabase + esbuild embed bundle)

This is the standard operating procedure for deploying review widgets to a new
client site (typically a GoHighLevel page). Follow the steps in order. Do not
skip the verification steps — they are the only thing standing between you and
a broken widget on a live client site.

---

## 0. Prerequisites (one-time setup)

Before your first deployment, make sure you have:

- [ ] Repo cloned and `npm install` completed
- [ ] A `.env.local` file in the repo root with:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - scrape.do API key (used by the review sync)
- [ ] Login credentials for the widgets admin app (ask Ali to create one with
  `node scripts/create-admin-user.mjs` if you don't have one)
- [ ] The client's **Google Place ID** (from Google Maps / Places API — you can
  verify it with `node scripts/test-places-api.mjs`)
- [ ] Access to the client's GHL site (or wherever the embed will be pasted)

---

## 1. Onboard the business

Register the business and create its default reviews widget:

```bash
node scripts/add-business.mjs "Business Name" PLACE_ID "Full Address"
```

This prints a **widget ID** (UUID). Save it — you will need it for the embed
code and for testing.

If the business already exists, the script reuses it and tells you the existing
widget ID. Do not create duplicates.

---

## 2. Sync the reviews

Pull reviews from Google (via scrape.do) into Supabase:

```bash
npx tsx scripts/sync-reviews.ts PLACE_ID
```

Expected output: business name, average rating, total reviews, pages fetched,
reviews stored, widgets updated. If reviews stored is **0**, stop here and
check the Place ID — embedding a widget with no reviews will render an empty
widget on the client site.

To re-sync **all** businesses later (e.g. weekly refresh):

```bash
npx tsx scripts/sync-all-reviews.ts
# or, skipping already-synced ones:
npx tsx scripts/sync-all-reviews.ts --skip-file synced.json
```

> **Quota warning:** each successful Scrape.do Maps Reviews request costs 10
> credits. This app requests 20 reviews per page, so its normal 40-review sync
> costs up to 20 credits per business; a 500-review refresh costs up to 250
> credits before retries. Do NOT run `sync-all-reviews.ts` more than once a
> day, and check remaining quota on the Scrape.do dashboard before a large
> batch. Report usage to Ali after bulk syncs.

---

## 3. Configure the widget in the editor

1. Log in to the admin app (production URL or `http://localhost:3000` with
  `npm run dev` running).
2. Open the widget from the **Widgets** page.
3. Configure in the settings tabs:
   - Title/subtitle, star color, layout
   - **Review image size**: Small / Medium / Large / XL (100×100) — XL applies
     to review images only; author avatars cap at Large
   - Popup width, drawer mobile mode (`peek` is the default — keep it)
   - Carousel max-width is **opt-in** — only enable it if the client's page
     layout needs it
4. Set the **allowed domain(s)** for the embed (the client's site domain).
   Requests with an unlisted Origin/Referer are rejected. For compatibility,
   bootstrap scripts still allow requests with both headers absent; these
   public payloads and referrer checks are not an authentication boundary.
5. Save.

---

## 4. Test locally

Check the backend before running tests: a local Next.js server can still point
at production Supabase. The local mutation suite must reject production URLs
and accept only the explicitly isolated test environment. Do not use the
checked-in example widget IDs as permission to modify real records. Tests of
forms, sync and alerts must block real email, webhooks and scraper requests.
See the [serving implementation plan](superpowers/plans/2026-09-21-widget-serving-performance.md)
for the isolation and release gates.

Run the credential-free regression checks before using a real backend:

```bash
npm run test:unit
npm run test:e2e:loader
```

The loader suite builds the actual widget bundle, intercepts all browser
requests and starts no Next/Supabase server. Mutation tests are a separate
`npm run test:e2e:mutations` command and require dedicated `E2E_SUPABASE_*`
credentials, an explicit allowed project ref, `E2E_ALLOW_MUTATIONS=true` and
`E2E_BASE_URL=http://127.0.0.1:3000`. They refuse the known production project,
remote app targets and reuse of an existing server. Never weaken those guards
to make a local test run against the ordinary application `.env`.

Run the automated end-to-end embed test (simulates an external GHL page):

```bash
npm run dev   # in one terminal
node scripts/test-embed.mjs WIDGET_ID http://localhost:3000
```

Expected: `RESULT: PASS — widget rendered live business data`.

Also do a **visual check** by opening `public/test-embed.html` in the browser
(add the new widget's embed div) and confirm:

- [ ] Reviews render with correct business name, rating, and reviewer photos
- [ ] No pricing chart or other leftover mock elements
- [ ] Mobile: narrow the browser below 768px — carousel shows 1 card,
      drawer peeks correctly
- [ ] Desktop: layout matches what the client approved

---

## 5. Deploy

```bash
npm run lint
npm run build
```

Validate on an isolated Vercel preview before deploying production. Verify
renderer CDN HITs, current data after an ordinary reload, domain rejection,
and both stable and historical script aliases. A local passing test does not
establish Vercel cache behavior.

Then deploy the app (Vercel: push/merge to `main` triggers deployment;
production URL: `https://builtbyshahwidgets.com`). The build produces
`public/widget.js`, which is served from the app's own domain — no separate
CDN upload is needed unless the CDN setup changes.

After deployment, re-run the embed test against production:

```bash
node scripts/test-embed.mjs WIDGET_ID https://builtbyshahwidgets.com
```

---

## 6. Embed on the client site

Paste this into the GHL page (Custom HTML element), using the widget ID from
step 1:

```html
<!-- BuiltByShah Widget Embed -->
<div data-bbs-embed="WIDGET_ID_HERE"></div>
<script async src="https://builtbyshahwidgets.com/api/embeds/widget/WIDGET_ID_HERE/data.js"></script>
<script async src="https://builtbyshahwidgets.com/api/embeds/widget.js"></script>
<!-- End BuiltByShah Widget Embed -->
```

Both scripts download asynchronously. The widget mounts when its own data,
container and renderer are ready; it does not wait for the host page to finish
parsing. Use the snippet generated by the editor. Renderer and data URLs stay
the same when settings or renderer code changes.

Existing blocking bootstrap and one-script snippets remain supported. Changing
an already-pasted blocking tag to `async` is an optional one-time client-page
improvement. Serving new JavaScript cannot change that tag's HTML behavior.

Notes:
- One `widget.js` script tag per page is enough, even with multiple embed divs.
- Keep the generated data-first tag order. If a renderer runs before the parser
  reaches a later data tag, it may request data itself and the later tag can
  cause one extra request. Page builders should insert fresh placeholders,
  without copying a rendered node's `data-bbs-mounted` marker.
- `/widget.js` and historical `/widget.<hash>.js` aliases resolve to the current
  renderer before static files. Check any customer-supplied `integrity` hash or
  CSP pin before a renderer update; bytes pinned by a site cannot change freely.
- `data-designdetail-embed` and `data-custom-widget` attributes also work
  (legacy support) — always use `data-bbs-embed` for new embeds.
- The widget renders inside Shadow DOM; GHL page styles cannot break it, and
  it cannot break the page.

---

## 7. Post-deployment verification

On the **live client page** (not just the test harness):

- [ ] Widget renders with live reviews (correct business name and rating)
- [ ] Check on a phone or mobile emulator (below 768px)
- [ ] No console errors in browser DevTools
- [ ] Popup/drawer opens and closes correctly
- [ ] Confirm with the client / Ali and record sign-off in WhatsApp

---

## 8. Ongoing maintenance

The implemented transport targets Vercel Hobby. The shared renderer requests
one day of Vercel CDN freshness and browser revalidation. Mutable bootstrap and
legacy JSON data use no-store, with a fresh allowed-domain read. There is no
cron, publication queue, database migration or paid cache service in this
transport. A successful database save needs no separate publication action;
the next successful new page load reads current data. Already-open widgets
retain their initial data until reloaded.

Forms carry the rendered schema fingerprint back to the submission endpoint.
If field meanings or rules changed while the form was open, the server rejects
the stale submission before storage or delivery and asks the visitor to reload.
Older cached renderers without a fingerprint keep server-side answer validation,
but cannot detect every semantic change to an otherwise identical field.

Long-lived data caching remains unfinished. It must not be enabled until a
separately reviewed design proves next-load freshness and domain revocation.
Uncached data still incurs origin/database latency and uses Vercel function
quota; measure real usage and cold/warm timing before claiming a speedup.

During the first rollout, account for previously cached data (the old policy
had 60 seconds of browser freshness and a CDN stale window). New headers cannot
erase a response already in a visitor's cache. Validate each serving hostname,
promoted deployment and compatible rollback. Rolling back to the original
cache policy also restores its stale-data behavior.

| Task | Frequency | Command / action |
|------|-----------|------------------|
| Refresh reviews | Weekly | `npx tsx scripts/sync-all-reviews.ts` |
| Check scrape.do quota | Before every bulk sync | scrape.do dashboard |
| Report quota usage to Ali | After every bulk sync | WhatsApp |
| Re-verify embeds | After any `widget.js` redeploy | `node scripts/test-embed.mjs <id> <prod-url>` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Widget renders nothing on client site | Domain not in allowed list | Add the domain in the widget editor settings (step 3.4) |
| Widget empty / no reviews | Sync never ran or bad Place ID | Re-run step 2; verify Place ID with `scripts/test-places-api.mjs` |
| `test-embed.mjs` fails | App not deployed or widget ID wrong | Re-run `npm run build` + deploy; double-check the UUID |
| Old widget version still showing | Historical cached response, wrong serving alias, or a pinned script hash | Inspect script URL, ETag/cache headers, deployment and CSP/SRI; ordinary new loads must work after the documented transition |
| Sync fails for one business | scrape.do error or delisted business | Re-run just that one: `npx tsx scripts/sync-reviews.ts PLACE_ID` |

## Escalation

If anything above doesn't resolve the issue, message **Ali** on WhatsApp with:
the widget ID, the client site URL, a screenshot, and any console errors.
