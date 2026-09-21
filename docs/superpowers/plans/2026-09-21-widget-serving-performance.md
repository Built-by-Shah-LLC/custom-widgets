# Widget serving performance and next-load freshness

Status: Kimi K3's focused second review found no remaining plan-level blockers. Ready for user review and the subsequent safety-guard/loader implementation. Long data caching remains subject to the explicit Phase 0 decision below. Implementation and production actions are not started.
Date: 2026-09-21
Planning branch: `codex/widget-serving-plan`
Source baseline: `36f5d0b` on `main`
Reviewer requested: Kimi K3, run through the locally installed CLI.

## 1. Agreed outcome and boundaries

Widgets should render as soon as their own placeholder, data, and renderer are ready. They must not wait for the host page's `DOMContentLoaded` event. The customer must never replace a pasted embed URL because a widget setting changed or the application was redeployed.

The user confirmed that edits only need to appear on the **next page load**. An already mounted widget keeps its initial configuration and content for that page visit; no polling, Realtime subscription, or routine background refresh is required. A new full navigation/reload is a new visit; restoring a page from the browser back/forward cache is an existing visit.

“Saved and published” means the database write and the required cache publication have completed. A normal new load following that acknowledgement must receive that revision or a later revision without requiring a hard refresh. Concurrent loads that began before acknowledgement may finish with the previous revision. If publication is pending or fails after a successful database write, the UI must distinguish this from both an unsaved change and successful publication.

This branch initially contains only this plan and review evidence. Future implementation is divided into independently reviewable phases below. No deployment, live database migration, review synchronization, cache purge, or customer-site edit is authorized by drafting this plan.

## 2. Evidence and what it does not prove

Read-only inspection found:

- The generated snippet contains a blocking per-widget `data.js` tag followed by an async shared bundle (`src/components/WidgetsHome.tsx`).
- `src/embed.tsx` prefetches known legacy widgets, but waits for `DOMContentLoaded` to mount while parsing is in progress.
- `data.js` awaits the allowed-domain lookup, then waits for parallel lookups in `widgets`, `before_after_widgets`, and `form_widgets`.
- Reviews are already synchronized into `widgets.cached_reviews`; Google/scrape.do is not called when a visitor loads a widget.
- Public data responses request 60 seconds of browser/CDN freshness and a 300-second CDN stale window. The allowed-domain list has a separate five-minute process-local cache.
- The bundle route reads `public/widget.js` with an in-process file cache. It sends browser revalidation headers without a CDN freshness period.
- Every bootstrap-backed embed still fetches configuration again; review widgets also refetch reviews.
- The review bootstrap includes both the raw `config.cached_reviews` and mapped top-level `reviews`.
- Existing hashed files in `public/` can bypass the current fallback rewrite and keep serving older renderer code. `/widget.js` also needs an explicit public-path check because the current middleware does not list it as a public script route.

Production HTTP spot checks from this session:

- Review bootstrap TTFB: 1.30 s on MISS, 0.24 s on HIT.
- Before/after bootstrap TTFB: 1.13 s on MISS, 0.28 s on HIT.
- Shared bundle TTFB: 1.15–1.68 s with MISS; a subsequent conditional request returned 304 in 0.47 s.
- A 40-review payload was approximately 75 KB uncompressed / 34 KB gzip. Removing the duplicate review property in memory reduced the calculated gzip size to approximately 18 KB.
- The deployed bundle was approximately 87 KB uncompressed / 28 KB gzip and differed from the local checked-in bundle hash. The demo page's DOM confirmed the blocking bootstrap tags and successful mounts.

These are a small number of request samples, not browser paint benchmarks, SQL execution times, or proof of a serverless cold start. Longer CDN retention reduces misses but cannot eliminate first requests in a new location, eviction, deployment misses, or host-page main-thread contention.

## 3. Design decisions

### 3.1 Stable URLs and compatible payloads

Keep `/api/embeds/widget.js` as the stable full renderer URL. Do not introduce a required hash into customer snippets. Keep `/api/embeds/widget/<id>/data.js` stable for per-widget data. Existing `data-bbs-embed`, `data-custom-widget`, and `data-designdetail-embed` attributes remain supported.

Use a versioned public payload contract internally, with additive `schemaVersion` and revision metadata. Preserve fields consumed by existing deployed bundles until mixed-version compatibility is verified. A widget revision is not a new customer-facing URL.

Continue storing widget configuration and cached reviews in the existing tables for the first implementation. A separate object-storage snapshot platform, new CDN provider, database tier upgrade, code splitting, and image transformation system are not prerequisites. Reconsider these only if measured misses remain the dominant cost after the changes below.

### 3.2 Nonblocking loader and per-widget readiness

Newly copied snippets use two async classic scripts: per-widget bootstrap first in markup, then the stable shared bundle. Downloads may overlap; execution order is deliberately not assumed. Retain the old blocking snippets as compatible input. Already-pasted blocking HTML cannot be made nonblocking by changing only the server's JavaScript; updating that markup is an optional customer-site action after release, not a requirement for continued functionality.

The bootstrap continues assigning `window.__BBS_WIDGET_DATA__[id]` for old bundles. Add a small readiness notification understood by the new loader. When the data script executes first, the loader reads the existing value; when it executes later, it notifies the loader. The notification must not mount components or overwrite an already mounted widget. Also attach `load`/`error` listeners to adopted data script elements and re-read the bootstrap global on `load`: cached assignment-only scripts never emit the new notification. Check the global before listener registration and immediately after registration to close the already-completed-script race. Readiness must not depend on DOMContentLoaded; a one-time rescan there is a recovery mechanism only. A preceding parser-blocking legacy data tag has already completed or failed when the following bundle runs, so absent data in that case goes directly to fallback instead of waiting ten seconds.

Introduce one shared runtime per API origin, reused across repeated bundle evaluations. It owns data promises keyed by origin + widget ID, script readiness listeners, a `MutationObserver`, and a `WeakMap` of placeholder lifecycle states. DOM attributes remain compatibility markers, not the sole source of mount state.

Per-placeholder lifecycle: discovered → waiting for data → ready → mounting → mounted, or failed. Mount immediately when ready. A slow or failed widget cannot hold up unrelated widgets. The same widget ID in two placeholders shares a data request but mounts twice. Before taking ownership, check both `data-bbs-mounted` and any existing shadow root. Treat a root owned by an older runtime as external ownership: never attach a second shadow root or unmount it. Set the legacy `data-bbs-mounted='true'` marker synchronously when claiming a new node, before attaching a shadow root, so an older bundle running later also skips it. On mount failure, clear only markers/resources owned by this runtime and continue mounting other widgets. Removing or changing a node owned by another runtime must not cause the new runtime to destroy the old root; automatic teardown/ID-change handling is guaranteed only for roots the new runtime owns.

At startup, scan existing placeholders. Observe additions and supported ID-attribute changes without repeatedly scanning the whole document. Reuse a matching bootstrap tag that is already loading; do not issue the old config/reviews requests at the same time. For a one-script embed or a dynamically inserted bare placeholder, load its bootstrap asynchronously from the captured script origin. This also removes the hardcoded registry as a requirement for newly created IDs.

Handle data-before-bundle, bundle-before-data, repeated scripts, detached/reinserted nodes, and placeholder ID changes explicitly. On removal, unmount owned Preact roots and detach per-node resources after confirming the node is no longer connected. On an ID change, unmount the previous instance and initialize the new ID. Stop bounded per-widget listeners/timers after resolution; the page-wide observer remains active for page-builder insertions.

On a script/network timeout (initial proposal: 10 seconds per widget), allow one deduplicated retry for transient failure. Known legacy widgets may use the existing JSON config/review endpoints as a fallback. Unknown IDs must resolve through the bootstrap route, not be guessed from the registry. Do not retry 403/404 continuously. Preserve the current quiet failure behavior and existing rate-limited error reporting.

This is asynchronous dependency coordination, not a separate JavaScript thread. Heavy host scripts can still delay execution. Avoid both busy polling and a fixed startup delay.

### 3.3 One authoritative snapshot per visit

Once a validated bootstrap is accepted, initialize the embed from it and skip immediate config/review refetches in all four embed wrappers. Retain the fetch path for genuinely missing/invalid bootstrap data and older one-script behavior during rollout. Share resolved promises rather than starting a new request for every component/effect.

Use a single server-side public-payload builder for bootstrap data and canonical mappings. Exclude `cached_reviews` from the nested config object and include the canonical review array once. Do not silently truncate existing review counts/filter behavior. A badge's lazy review loading is a later optimization, not part of this contract change.

Prerequisites before removing refetches:

- Validate payload kind, ID, config type, review array, and supported schema version. Do not treat compile-time types as runtime validation.
- Correct the existing normalization mismatch: `mapBusinessRow` reads snake_case metrics, but the bootstrap reader passes it already-mapped camelCase business metrics. Keep the existing camelCase public bootstrap contract: map database rows once in the server payload builder and validate (do not remap) the canonical business object in the bootstrap reader. Legacy JSON config fetches still map their raw database join once. Do not change the bootstrap business wire shape to raw snake_case just to accommodate the buggy second mapping. Preserve actual rating/count on the first render; a later refetch must not be required to repair them.
- Define explicit public form fields. Both the current bootstrap and the public form GET expose raw form rows containing `submit_webhook_url` and `submit_email`; removing these is a deliberate security hardening included because the same responses will be cached longer. `formFromDbRow` currently reads these fields, but `FormWidget` sends answers to the server submission route rather than using the delivery destinations. Separate the public rendering contract from private delivery/admin configuration; preserve full private configuration for authenticated editors and server submission, and ensure a public-shaped object cannot overwrite stored destinations with empty defaults on Save. Do not fetch or reproduce real delivery URLs in review documents. If deployment-time inventory finds a URL containing an actual secret, handle its exposure/rotation separately with the owner; an email address alone is not a credential.
- Keep JS serialization escaping for `<`, U+2028, and U+2029. Additive metadata must not introduce executable string interpolation.
- An already-open form may retain an older schema. Current server validation must fail safely with a useful reload/retry message rather than silently reinterpret answers or send them to a client-chosen destination.

### 3.4 Separate browser and CDN cache policy

The intended browser policy for mutable stable URLs is `public, max-age=0, must-revalidate`, with ETags where useful. A normal reload consults the network but should ordinarily be answered by the CDN. Do not use long browser TTLs or `immutable` on a stable mutable URL.

The proposed Vercel-only CDN policies, enabled only after the publication gates pass, are:

- Shared renderer: `Vercel-CDN-Cache-Control: public, max-age=86400`.
- Public widget data and compatible JSON data responses: `Vercel-CDN-Cache-Control: public, max-age=3600` initially.
- No stale-while-revalidate period for mutable widget data in the initial design. Next-load correctness after publication takes priority over silently serving an old revision.
- Errors and rejected origins: `no-store` in browser and CDN controls; no negative caching.
- Authenticated admin reads, mutation responses, form submissions, and publication-status endpoints: private/no-store.

Do not conflate an ETag/304 with zero network latency. Preserve conditional GET behavior while proving the CDN can serve/revalidate the representation. Keep browser and CDN directives consistent on 200 and 304 responses.

Attach cache tags covering each widget and its business, plus a namespace for all public widget data. All origin/referrer variants and legacy endpoints for the same data must share the correct tags. Do not place credentials or user-supplied arbitrary tag strings in headers.

Vercel documentation distinguishes soft invalidation from deletion: soft invalidation can serve stale content on the next request. Use a tested immediate deletion policy for next-load publication; verify the installed `@vercel/functions` signature and deletion deadline semantics before coding. Do not copy the documentation's positive grace-period example and assume it gives immediate freshness.

The exact provider behavior is an implementation gate: prove environment scoping, propagation, and in-flight response behavior on an isolated preview, backed by documented provider semantics rather than treating passing samples as a global consistency proof. Do not claim a globally linearizable “next load” guarantee from a purge API acknowledgement alone. Give synchronous publication a five-second budget; after that return saved-but-pending with a revision/status identifier and continue through the durable worker. Proposed operational target: at least 95% of normal saves publish within that budget; persistent pending work beyond 60 seconds raises an actionable alert. These are targets to validate, not a vendor SLA.

**Pre-decided fallback if the deletion/variation/latency gate fails: revision-addressed snapshots.** Keep existing customer URLs functional; do not ship a one-hour mutable cache with an unproved correctness dependency.

1. Add a private immutable snapshot store and an atomic published pointer per widget. Each snapshot contains the canonical public DTO, schema version and content digest, keyed by a generated revision that is never reused. A publication worker builds from a consistent database snapshot, stores the immutable result, then advances the pointer only if the desired source generation still matches; otherwise it discards that completion and retries. Deletion publishes a tombstone. Do not rely on today's `updated_at` values as complete revision IDs: all public configuration, business and review changes must participate.
2. An uncached resolver reads current access policy and the published pointer on every new visit. It must use primary/consistent reads and return `Cache-Control: no-store` plus explicit no-store CDN controls. Publishing is acknowledged only after pointer advancement. Purge propagation is no longer on the data-freshness correctness path.
3. For new snippets, a stable async `resolve.js` route emits revision metadata for the new runtime, which obtains the immutable snapshot at `/api/embeds/widget/<id>/rev/<revision>.js`. If and only if the fallback is selected, newly generated snippets use `resolve.js` in place of the `data.js` bootstrap tag described in §3.2; the shared renderer URL stays the same. Retain revisions across deployments and rollback; storage is independent of build artifacts. Start without garbage collection so old in-flight references cannot be deleted prematurely; specify retention before adding cleanup.
4. Keep **existing** `/data.js` as an uncached full bootstrap from the published snapshot. It must still assign the old global synchronously in that script execution: silently replacing it with an async pointer breaks older renderers. Existing JSON API fallback routes likewise return the current published snapshot without a mutable CDN cache. New revision-aware snippets are optional; customer URLs never need to change merely because data changes, but old blocking snippets cannot receive all the new transport gains without a one-time markup update.
5. Revisioned payloads contain only public display data. The resolver checks admission on every new load. In addition, implement the existing Origin/Referer policy in a dedicated public-read middleware branch **before CDN lookup** for direct revision requests, using a fresh allowlist read and no session/auth-cookie work; verify that ordering on Vercel before caching these responses. Set the immutable payload's browser freshness to zero and its Vercel CDN TTL to one year: revisions never change, but new network requests must still pass current admission checks. This deliberately adds admission work to each payload request rather than quietly weakening domain revocation. Previously downloaded public bytes cannot be revoked from a visitor, and missing-referrer bootstrap access remains the existing documented policy. If this fully specified fallback fails the latency tests, ship only the other validated improvements and report long data caching as unfinished.
6. The tradeoff is an uncached resolver plus an extra request for the new protocol; legacy paths still incur an uncached snapshot read. Measure this explicitly. The fallback is not presumed faster, and it does not authorize a new database/CDN vendor. Build the publication store/pointer variant only if the Phase 0 gate selects it, not alongside the primary purge design.

Select the primary tagged-cache approach only if correctness and latency gates pass. Otherwise select the snapshot-pointer fallback and record the result before Phase 2 schema work. If neither meets the performance/access requirements, ship only the independently validated loader/payload/bundle improvements and report long-lived data caching as unfinished. There is no silent short-TTL exception to the next-load freshness requirement.

### 3.5 Domain checks and public-response safety

Preserve current policy: bootstrap scripts allow absent Origin/Referer, but reject a present disallowed origin; JSON APIs require an allowed origin. These are public widget payloads, and referrer checks are not authentication. Changing this product policy is out of scope.

Make cache variation match every header used in the access decision: current routes use Origin with Referer fallback, so successful and rejected responses must handle `Vary: Origin, Referer` consistently. The current bootstrap success response has no `Vary`, so the allowed-versus-denied response inconsistency must be fixed even before increasing TTLs. Verify actual Vercel behavior and the no-header variant. Do not lengthen caching if an allowed-origin request can prime a response served to a rejected origin. Denials must remain no-store; explicitly test 404s too because those can otherwise be cacheable.

Phase 0 variation decision: after one priming request per expected variant, run at least 100 representative requests across allowed origins, repeated visits, and host referrer policies including full-URL referrers. Target at least 80% HITs among successful steady-state requests and the same-location latency targets below. If referer cardinality makes that unattainable, select the revision-addressed fallback rather than dropping `Vary`. Per-origin tags may reduce revocation's purge scope, but **do not fix cache-key fragmentation**. A normalized-origin pre-cache middleware design is not an automatic fallback: it requires its own admission/latency proof and cannot move a live database lookup in front of every hit without measurement.

Remove the uncoordinated five-minute process-local domain cache from this path before claiming revocation freshness. Start with a fresh allowlist read on origin cache misses, which should become infrequent. A future shared invalidatable allowlist cache is optional. Never assume clearing one function instance invalidates the others.

On cold bootstrap misses, execute independent allowlist/data reads concurrently where safe, but return no payload before the origin decision succeeds. Keep actual-kind hinting/query consolidation optional until a benchmark justifies additional schema complexity. Fail closed on an allowlist read error; do not cache an empty successful list.

Public embed middleware should short-circuit before session refresh/auth setup for the precisely allowlisted public GET/HEAD/OPTIONS routes. Keep admin/mutation authentication intact. This removes avoidable work, but do not claim that anonymous `getUser()` currently always makes a network request: the installed SDK can return locally when no session exists.

### 3.6 Publication, retries, and all write paths

Create a small durable publication outbox in a proposed future migration only after Phase 0 selects the serving design. It holds tag/scope, monotonically increasing desired generation, completed generation, state and retry metadata; it contains no full widget payload or credentials. Tag generation and outbox insertion must be atomic with the database change, using carefully scoped triggers, not a best-effort insert after a REST update. Use the same source-generation mechanism for the snapshot-pointer variant, with a different publication adapter.

Trigger coverage:

- Widget create/update/delete in all three widget tables → that widget's data tag.
- Business fields used by widgets → business tag, including all badges/carousels referencing it.
- Allowed-domain create/update/delete → all public widget data variants.
- Review sync's published `cached_reviews` changes → affected widget tags; raw intermediate review upserts are not themselves a complete published snapshot.

No network calls inside a database transaction/trigger. Use least-privilege schema/function placement, explicit search paths and grants, RLS, and service-only worker access. Choose unique scope keys and a pending-work index. Coalesce repeated changes to the same scope; use compare-and-set generation checks so an older worker cannot mark newer work complete. Duplicate purges are idempotent: the initial implementation does not require distributed lease metadata for correctness. Bound batch size/concurrency and deduplicate in-process; add claims/leases only if measured duplicate work or provider limits require them. Do not hold row locks while calling Vercel. Snapshot-pointer publication also needs generation-guarded pointer advancement, not merely an idempotent purge.

Start with conservative namespace-wide domain-change purges for correctness, acknowledging that this can cause simultaneous misses. Before enabling long TTLs, test a representative revocation burst of 100 parallel reads with no errors or unbounded database concurrency. If provider limits or origin load make that fail, add normalized per-origin tags for exact-domain changes; wildcard/remapping changes still need a safe broad purge. No automatic whole-project purge or warming loop is part of routine publication.

API writes commit data, then synchronously attempt to drain their relevant publication work with a bounded timeout. Only return published=true after the required generations have completed. On provider failure, return an explicit saved-but-pending result (not an ambiguous write failure); persist retry work and expose an authenticated publication status/retry action. Update every editor/caller that currently equates any 2xx with “Saved.” For create requests, preserve the new ID even if publication is pending so retries do not create duplicates. Deletes need the same persisted/published distinction.

A scheduled authenticated worker retries pending entries with bounded backoff and alerts on sustained backlog. This is a proposed deployment prerequisite, not a task automation being created now. Verify the hosting plan supports the chosen schedule; normal successful saves should not depend on the schedule. CLI sync/import tools explicitly target the correct project and production/preview environment, invoke the same publication service after writes, and report pending publication separately from successful database work. Triggers ensure a CLI crash/direct maintenance write does not silently omit invalidation, but such out-of-band work is not labelled published until the worker completes it.

Use environment-specific database/outbox ownership: a preview must not consume production jobs or publish to production merely because both environments happen to share database credentials. The initial validation must use an isolated Supabase project or local database. Audit all production serving aliases/projects before enabling long TTLs; drain every serving target affected by a write.

The outbox gives durable delivery, not automatic protection against stale in-flight responses. Test: old GET starts, save commits, purge completes, old GET finishes; another new GET must not receive reinserted old data. Treat an unresolved provider fill-after-purge race as a release blocker for long caching. Conditional completion also must cover overlapping saves, business reassignment, and delete/recreate.

### 3.7 Renderer deployments and legacy routes

Keep the full bundle at the stable route for this release; a tiny loader plus retained immutable chunks is unnecessary for the measured 28 KB bundle.

Use `beforeFiles` rewrites or an equivalent verified routing arrangement so both `/widget.js` and historical `/widget.<16-hex>.js` URLs resolve to the current stable renderer, even when an old file exists in `public/`. The existing fallback-only rewrite does not cover that case. Avoid redirect hops. Audit `widget-manifest.json`; either keep it compatible with a URL that reaches the current renderer or deliberately retire consumers only after inventory proves none remain.

Vercel deployment identity participates in cache keys, but test promotion AND rollback on the actual aliases. Rolling back can re-expose a previous deployment's data cache. Delete the appropriate data tags for the target serving environment as part of promotion/rollback before declaring it ready, then verify the current database revision through the promoted alias. Do not assume “deploy flushes everything.”

Schema changes must be additive while old/new bundles coexist. A previous renderer must tolerate the compatible new payload and a new renderer must tolerate previous payloads during rollout. Existing browser-cached responses cannot be remotely erased: the new guarantee begins after a communicated transition window of at least 60 seconds following the serving cutover, covering currently issued browser data freshness. Inventory any historic longer/immutable bundle policy before selecting that window; do not assert that 60 seconds covers unknown old policies. CDN stale entries also need the route/tag transition described above. Audit manifest consumers through available serving/access logs plus source search, not just the absence of imports in this repository. Preserve historical URLs until that inventory is complete; check customer SRI/CSP assumptions before changing the body served at a historical hashed URL.

## 4. Implementation sequence and file ownership

### Phase 0 — Baseline, contract, and provider proof

- **First deliverable, before any mutation-bearing test runs:** a fail-closed Playwright environment guard. Require dedicated explicit test database credentials and an exact allowlisted isolated Supabase project reference; reject the known production project even if a generic opt-in variable is set. Independently require a localhost or exact allowlisted preview base URL for mutation suites. Do not treat all `*.vercel.app` hosts as test hosts. Clear/mask inherited delivery credentials and stub outbound email, webhook, scraper and alert services. Validate canary URL/project selection so mutation specs cannot be redirected at the public canary or production. Add tests proving the guard rejects the current production `.env` combination before server startup or test execution.
- Add deterministic fixture pages and timing instrumentation for old single-script, old blocking-bootstrap, new async-bootstrap, repeated bundles, and dynamic placeholders.
- Record current cold/warm request counts, payload sizes, and first useful widget paint. Use an isolated production build/preview, not `next dev` timings.
- Verify Vercel tags, immediate deletion, `Vary`, promotion/rollback, origin aliases, and stale in-flight fills. Keep long data caching disabled until the publication proof passes.
- Files: proposed test guard, `e2e/embed.performance.spec.ts`, `e2e/fixtures/*`, performance measurement script, relevant Playwright configuration. Add an explicit isolated performance project/testMatch: the current local project's pattern does not discover a plain `.performance.spec.ts` file. This phase may require preview-only deployment setup later; no production mutations for benchmarks. Provider proof can run alongside Phase 1; it must finish before selecting Phase 2 schema/publication work, and must not block the independent loader improvements.

### Phase 1 — Payload correctness and independent mounting

- `src/embed.tsx`: immediate scan, shared runtime, observer, per-widget state machine and cleanup.
- Proposed `src/lib/embed-runtime.ts` / tests: isolate coordination from DOM rendering and make ordering/failure behavior testable.
- `src/lib/bootstrap.ts`, `src/lib/prefetch.ts`: compatible readiness signaling, canonical validation, origin-scoped deduplication and fallback.
- `src/widget-registry.ts`: preserve legacy fallback; bootstrap kind remains authoritative.
- `src/components/WidgetsHome.tsx`, `embed-site/index.html`, `public/test-embed.html`: generated/test async snippets; document optional markup updates for old blocking embeds.
- `src/app/api/embeds/widget/[id]/data.js/route.ts`, proposed `src/lib/widget-public-payload.ts`, `src/lib/widget-queries.ts`, `src/lib/widget-mappers.ts`: one review array, public-field allowlists, schema/revision metadata, safe serialization and correct business metrics.
- `GoogleReviewsEmbed.tsx`, `GoogleReviewsCarouselEmbed.tsx`, `BeforeAfterEmbed.tsx`, `FormEmbed.tsx`: accept a validated initial snapshot and stop routine refetch when present, after all ordering and mapping tests pass.
- Preserve field mappings/visual behavior; check form submit handling if schema-staleness messaging needs adjustment.

### Phase 2 — Durable publication and honest save state

- Proposed migration (name generated by Supabase CLI at implementation time): outbox, narrowly scoped triggers, access controls, indexes and generation-safe operations; immutable snapshot/pointer tables only if the selected fallback requires them.
- Proposed `src/lib/widget-publication.ts`: provider adapter, tag mapping, retries and generation-safe completion. Pin any new dependency and update the lockfile.
- Proposed authenticated publication status/retry and scheduled-worker routes; proposed hosting schedule configuration only after environment requirements are verified.
- Existing create/PATCH/DELETE routes for widgets, before/after, forms, businesses, and allowed domains: publication acknowledgement and explicit pending state.
- `src/lib/sync-reviews.ts`, `src/app/api/v1/sync/route.ts`, `scripts/sync-reviews.ts`, `scripts/sync-all-reviews.ts`, `scripts/add-business.mjs`, `scripts/import-shah-data.mjs`: cover sync/maintenance writes and their publication results. Inventory additional writers before merging.
- `src/components/editor/{WidgetEditor,CarouselEditor,BeforeAfterEditor,FormEditor}.tsx`, `EditorShell.tsx` as needed, `ReviewFetchButton.tsx`, `WidgetsHome.tsx`, `SettingsPage.tsx`: published/pending/failed states and idempotent retry behavior for saves, create/duplicate, delete, sync and domain changes.
- `src/lib/alerts.ts` or existing alert callers: scoped publication-backlog diagnostics without credentials/payloads.

### Phase 3 — Cache serving and compatibility

- `src/lib/cache-headers.ts`: separate browser/CDN policy helpers, data/script/error policies and tags.
- Bootstrap and all public single-widget JSON GET routes: canonical tags, `Vary`, conditional behavior and one-hour CDN caching only after Phase 2 proof.
- `src/lib/domain-utils.ts`: correct read-error behavior and eliminate the uncoordinated process-local cache for domain-sensitive origin responses.
- `src/middleware.ts`: public-path early return with method restrictions and compatibility aliases; keep mutations authenticated.
- `src/app/api/embeds/widget.js/route.ts`: CDN policy, consistent 200/304 headers, correctly matched ETags, no change to stable URL.
- `next.config.ts`, `scripts/build-widget.mjs`, `public/widget-manifest.json`, retained historical assets: unify legacy routes without bypassing the current renderer. Review generated bundle changes separately from source.

### Phase 4 — Validation and operational rollout

- Run required unit/integration checks, then isolated-browser/preview checks below. Capture raw measurements and revision traces.
- Run the production build and lint; inspect output asset paths and bundle sizes.
- Update `docs/SOP-widget-deployment.md` with publication status, serving aliases, retry operation, rollback, and optional snippet refresh instructions. Correct obsolete `/widget.js` guidance once routing is fixed.
- Have Kimi K3 adversarially review the implementation diff and evidence again; this planning review is not a substitute.
- Prepare migration, worker deployment, rollout and rollback instructions for the user's later implementation/deployment decision.

## 5. Verification matrix

### Loader correctness

1. Hold DOMContentLoaded behind an unrelated deferred script for three seconds. A ready widget must visibly mount before that event.
2. Test bootstrap-first, bundle-first, delayed data, missing data, malformed data, network error, disallowed origin, unknown ID and deleted widget. Include the cached assignment-only old bootstrap with the new bundle in both orders. Its `load` event must resolve readiness without waiting for a notification or DOMContentLoaded. Compare successful slow-data and observable-error fallback timing with the baseline; reject a new artificial timeout delay after data/error is already observable. The 10-second cap is only for an otherwise unobservable stalled request, not a normal compatibility path.
3. Repeat the bundle tag; put two identical IDs in separate nodes; mix all four widget kinds; add/remove/reinsert nodes and change IDs. Assert no duplicate root, no cross-widget blocking and correct teardown. Execute an actual preserved old bundle and the new bundle together in both orders, including stable plus historical hashed URLs. Verify legacy marker write/read and externally owned shadow roots without throwing or stopping unrelated mounts.
4. On a valid bootstrap, assert no initial `/api/v1/widgets/<id>` or `/reviews` request (or equivalent before/after/form request). Fallback paths must still work and remain bounded.
5. Assert the original script origin is used from an external host, multiple supported data attributes still work, and the host DOM/styles outside placeholders are unchanged.
6. Test actual page-builder execution/CSP behavior on a representative client page when access is available; an isolated harness alone cannot prove every builder integration.

### Payload and visuals

7. Correct rating/count on the first bootstrap paint, including zero/missing values and already-normalized business objects. All widget kinds render the same configured appearance and review ordering.
8. Review data appears once, with no silently lost reviews, image URLs, flags or styles. Record gzip/Brotli size before/after on identical fixtures.
9. Form public payload excludes delivery email/webhook and server-only fields. Existing field validation, submit routing and responses remain correct in isolated tests; never send real webhooks/email to test performance.
10. Invalid payloads and script-breakout strings are rejected/escaped. Old/new renderer-payload combinations remain compatible.

### Freshness, access and concurrency

11. Prime each data URL and legacy API variant. Save a style change; after published acknowledgement, normal-reload from an existing browser and a fresh browser. Both show the new revision without changing embed code.
12. Repeat for business reassignment, review sync, business rating/name updates, before/after image/config changes, form updates, widget creation/duplication/deletion and domain additions/removals. Existing open widgets remain unchanged.
13. Exercise database write success/provider failure, process death after commit, retry-worker failure, overlapping saves, delayed earlier responses and duplicate retries. Never show successful publication for a pending generation or duplicate a newly created widget.
14. Prime with allowed origin, denied origin, Origin absent + Referer present, and both absent, in both request orders. Denials must not become cached successes, nor poison authorized responses. Removing a domain must affect the next new load after publication.
15. Verify production/preview isolation, all serving hostnames, real CDN headers/tags, conditional GETs, retry auth and no server credentials in bundle/payload/logs.
16. Test the old-in-flight-GET/purge/new-GET race in the deployed provider. Test a deployment followed by a rollback after a widget edit; current data must survive both when checked through every serving alias, not only a deployment URL. If the snapshot fallback is selected, test pointer advancement under concurrent source changes, tombstones, retained revision URLs across rollback, old full-bootstrap compatibility, and rejection before snapshot execution on new visits from a removed domain.

### Performance and test safety

17. Collect at least 20 samples per comparable scenario: cold browser + warm CDN, repeat browser load, expired/purged data on the isolated preview, and multiple widgets. Add representative mobile throttling. Report median/p95 and separate DNS/TLS/TTFB/transfer/parse/mount/image timing.
18. Initial targets: warm bundle/data TTFB below 400 ms at the same measurement location; median first useful widget paint at least 30% better than the matched baseline; no per-widget mount delay above 50 ms after its own dependencies become ready under an otherwise idle test main thread. These are acceptance targets to measure, not promised global latency.
19. Prove the deferred-host-script experiment independently of those network targets. Record request counts and transferred bytes; do not sum parallel request durations as page latency.
20. A longer idle interval (including beyond the original six-minute cache window) should retain the improvement where CDN entries remain present. Also measure a true miss honestly; no keepalive ping or cache-warming loop may hide it.
21. Restrict mutation tests to an isolated database and preview. The current Playwright setup automatically loads `.env`/`.env.local`, which can point at production: the named Phase 0 guard is a mandatory prerequisite, not an optional checklist item. Do not run `npm test` blindly against the current credentials.
22. `npm run lint`, `npm run test:unit`, and a production build are required for implementation; select only the safe isolated browser suites. Existing canaries test rendering, not timing or save-to-cache propagation. CDN assertions require deployed preview evidence, not mocks alone.

## 6. Rollout, rollback and open gates

1. Land tests, payload normalization and loader changes first with existing conservative cache behavior. New async snippets and old blocking/single-script snippets must coexist.
2. Introduce the additive outbox migration and worker in an isolated environment. Validate grants, retries, locks/indexes, caller UI states and all mutation paths. Run Supabase advisors and meaningful transaction/concurrency checks there.
3. Deploy publication support to the intended environment before increasing data TTLs. Keep long caching behind an explicit server-controlled rollout setting with a tested way to purge already-cached responses when disabling it.
4. Enable bundle CDN policy and legacy routing after promotion/rollback tests. Enable longer data TTLs only after the provider correctness gates pass. Purge old incompatible variants and account for prior browser TTLs during the transition.
5. Later production actions must list migration application, worker/schedule setup, dependency/environment configuration, deployment and any domain-specific snippet edits separately. None is complete merely because code or this plan exists.
6. On rollback, first stop long caching and clear the relevant serving tags, then restore the compatible previous application deployment. Keep the additive outbox schema until pending work is handled. Test the order: an app flag cannot change responses already being served solely from CDN cache.

Unresolved facts to verify during Phase 0, not assumptions to bury in implementation:

- Immediate-delete propagation and in-flight fill semantics on the selected Vercel API/version.
- Current production deployment, region, serving aliases/projects and whether any intermediary caches add independent freshness.
- Available isolated Supabase environment and worker schedule capability.
- Historic browser cache policies on retained hashed URLs and actual customer snippet variants.
- Whether real cold-origin latency still warrants a separate prepublished snapshot store after the simpler improvements.

If a gate fails, record the failed assertion and revise the design before enabling longer data retention. Do not compensate by asking customers to hard-refresh or replace embed URLs.

## 7. References and review record

- Local Next.js guide: `node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md` (read for this plan; framework cache invalidation must not be assumed to purge every response-layer CDN cache).
- [Vercel cache-control headers](https://vercel.com/docs/caching/cache-control-headers): separate browser and CDN policies.
- [Vercel CDN cache and Vary](https://vercel.com/docs/caching/cdn-cache): verify response eligibility and header variants.
- [Vercel CDN cache purging](https://vercel.com/docs/caching/cdn-cache/purge): tags, deletion versus invalidation, environment scope and deployment cache identity.
- [Vercel functions API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package): verify exact package signatures and deletion-deadline behavior at implementation time.
- Repository source paths cited above are the authority for current behavior; old “instant loading” design documents contain proposals that must not be treated as deployed guarantees.

The accompanying [adversarial review](../reviews/2026-09-21-widget-serving-performance-k3-review.md) records the exact CLI/model, original verdict, accepted revisions, deliberately different corrections and remaining gates. No passing implementation tests or production improvements are claimed by this planning document.
