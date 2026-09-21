# Widget serving implementation supervision — 2026-09-21

Status: architecture, final code review and focused recovery review complete. Kimi found no P0/P1 defect and verified the accepted P2 recovery fix. Final test-runner validation passed; provider release checks remain pending. No production deployment or data changes performed.

## Requested roles

- Implementation: Luna (`gpt-5.6-luna`), maximum reasoning effort, shared branch `codex/widget-serving-plan`.
- Supervision: Astra (`gpt-6-astra`) read-only architecture and code review.
- Adversarial supervision: Kimi Code CLI 0.41.0, explicit `--model kimi-code/k3 --agent plan --output-format stream-json`; read-only built-in plan agent. The first implementation-stage invocation exited successfully with code 0. CLI output is review evidence, not evidence of tests or production changes.

## Architecture decision and review dispositions

Both supervisors recommend the independent loader/payload/render-bundle improvements with no-store mutable data for the current release. Vercel Hobby compatibility is required. Long-lived data caching, the durable outbox, publication worker and pending-publication UI are explicitly unfinished; those are unnecessary for the selected uncached transport but have not been implemented by proxy.

Accepted checks: remove stale allowlist caching; make Origin/Referer variation consistent; preserve older snippets and root ownership; route retained hashed URLs before static files; remove duplicate review bytes/refetches; protect private form settings; isolate tests from production; verify actual provider behavior before release.

Corrections to the raw Kimi review below:

- A failed purge of the proposed one-hour entry would ordinarily be bounded by that entry's TTL, not approximately 25 hours. Daily cron can delay job completion/recovery, but it does not extend a one-hour cache TTL. It still fails immediate next-load freshness.
- Hobby supports tag purging; no claim is made that every possible purge architecture is impossible on Hobby. This proposal lacks the required retry and consistency evidence, so it is not selected.
- No-store only governs future network responses. Existing browser/CDN entries, concurrent reads started before commit, provider failures, and independently committed sync operations prevent an unconditional “zero staleness/safe by construction” claim. Deployment/rollback checks remain required.
- A passing local fixture is not a proof of Vercel CDN HITs, deployment promotion/rollback, live database consistency, or production performance. The document preserves these release gates.

## Kimi K3 architecture review (verbatim)

Review complete. I read the plan, the live serving routes (`data.js`, `widget.js`), `middleware.ts`, `domain-utils.ts`, `cache-headers.ts`, `next.config.ts`, and the canonical write path (`src/app/api/v1/widgets/[id]/route.ts`), and verified the Hobby cron facts against the [official Vercel doc](https://vercel.com/docs/cron-jobs/usage-and-pricing) (Hobby: once/day minimum, ±59 min precision — confirmed verbatim, including the deployment-time rejection of sub-daily expressions). Verdict below.

## Decisive recommendation

**Ship the minimal complete approach now: Phase 1 loader/payload/runtime improvements + bundle CDN caching + legacy-URL unification, with mutable widget data moved to honest no-store. Do not implement the one-hour mutable tagged-cache design on Hobby. Keep the revision-addressed snapshot fallback as the only viable future caching design, gated on conditions listed below. Do not let any short TTL survive as a silent compromise.**

Reasoning, decisively:

1. **The tagged-purge design fails two Hobby-specific gates, not one.** Beyond the already-unproven purge consistency (no isolated preview configured), the plan's publication architecture (§3.6) depends on a scheduled retry worker with a 60-second backlog alert target. Hobby cron runs **once per day with up to 59 minutes of jitter**. A failed purge on Hobby leaves stale data served for up to ~25 hours with no in-platform recovery. An external ping service (cron-job.org etc.) is a new unvetted dependency holding an authenticated secret — that is an operational decision for the user, not something to smuggle into the design.

2. **The snapshot fallback is Hobby-compatible on its correctness path but shares the out-of-band write gap.** Inline pointer advancement inside the API write request needs no cron and no purge — fully implementable and testable with local mocked fixtures today. But direct SQL/CLI writes and failed snapshot stores still need a drain mechanism, and on Hobby that is the same once-a-day cron. Mitigations exist (opportunistic drain on any admin request, manual "publish/retry" action in the editor UI, scripts calling the publication service inline since they are not serverless-bound), but they are real work, not free.

3. **No-store mutable data satisfies every stated requirement with zero unproven dependencies** — and is *faster than the snapshot fallback* on the uncached path (one request, no resolver hop, no admission-middleware-before-CDN proof needed). Next-load freshness becomes trivially true; domain revocation is immediate; direct SQL writes are always visible; deploy/rollback is data-safe.

4. **The current `WIDGET_CACHE_CONTROL` (`max-age=60, s-maxage=60, stale-while-revalidate=300`, `src/lib/cache-headers.ts:6`) already silently violates the next-load freshness requirement today.** Changing it is a correctness fix, not a regression — but it must be communicated honestly: every visit becomes an origin read (~1.1–1.3 s cold TTFB measured in the plan's own spot checks). The Phase 1 mitigations (halved payload via single review array, parallel queries, nonblocking mount, CDN-cached bundle) are what make this acceptable, and item 20 of the verification matrix (honest miss measurement, no warming loops) must stay.

## Scope honesty (anti-silent-reduction statement)

What ships in the minimal approach, explicitly:
- Stable URLs (unchanged), nonblocking loader, readiness coordination, dedupe, single authoritative snapshot per visit, halved payload, corrected `mapBusinessRow` double-mapping, public form-field allowlist, bundle `Vercel-CDN-Cache-Control: max-age=86400`, `beforeFiles` hashed-URL rewrite, Vary fixes, domain-cache removal, middleware early return.

What is explicitly **unfinished and must be labeled so** in the plan status line and SOP:
- Long-lived data caching of any kind (one-hour mutable TTL + tag purge: **not selected on Hobby** — fails retry-worker and purge-proof gates; revision snapshots: **deferred**, design retained, not built).
- The durable outbox, triggers, publication worker, saved-but-pending UI states. Note: without these, the editor save flow keeps its current honest behavior (DB write success = visible next load, because data is uncached) — so the pending-state UI work is *not* required for the minimal approach; that is a genuine scope reduction and should be recorded as such, not hidden.

## Implications check

- **Direct SQL/CLI writes**: minimal approach — zero staleness, strongest argument for it. Snapshot fallback — triggers can detect but only a worker can publish; on Hobby that means up to ~1 day unless scripts drain inline (they can and must) and a manual retry action exists. Tagged cache — same gap plus purge consistency risk. **P0 for any caching variant.**
- **Domain revocations**: minimal — immediate, but only after removing the 5-minute process-local allowlist cache (`src/lib/domain-utils.ts:6-28`), which delays revocation up to 5 min per instance even under no-store. That removal is mandatory regardless of caching choice. **P0** (correctness of a stated requirement).
- **Legacy `data.js` and hashed renderer URLs**: `next.config.ts:16` admits hashed files still present in `public/` bypass the fallback rewrite — three such files exist in `public/` right now, serving stale renderer code. `beforeFiles` rewrite is required; check SRI/CSP before changing bytes at historical URLs. Also `/widget.js` is not in `isPublicEmbedPath` — but per `src/middleware.ts:77-95`, `getUser()` runs *before* the public-path short-circuit anyway, so the early-return ordering fix covers both. **P0** (stable-URL requirement).
- **Deploy/rollback**: minimal — safe by construction; bundle rollback covered by deployment-identity cache keys + additive schema rule; purge bundle tag on promotion/rollback as belt-and-braces (purge API exists on Hobby even though data never depends on it). Snapshot fallback — safe (revisions in DB, deployment-independent). Tagged — needs purge-on-rollback against an unproven API. 
- **Auth/admin form config**: public form payload currently leaks `submit_webhook_url`/`submit_email` via `data.js` and the public form GET — fix the allowlist and the save-overwrite footgun now (P1 security, required before any caching, correct anyway); never reproduce real delivery URLs in review artifacts.

## P0 / P1 summary

**P0**
1. Do not build tagged mutable-data caching on Hobby: purge consistency unproven (no preview) + retry worker impossible in-platform (once/day cron, ±59 min). Record as "not selected," not "later."
2. Remove the process-local domain cache before claiming revocation freshness — under any design.
3. Fix hashed-file rewrite bypass and middleware ordering as part of the minimal ship; these are existing violations of the stable-URL requirement.
4. Phase 0 fail-closed test-env guard remains a hard prerequisite before any mutation test runs (`.env` currently points at production; Playwright auto-loads it).

**P1**
1. No-store data raises per-visit origin latency; acceptance depends on Phase 1 payload/loader gains measured honestly (matrix items 17–20, no warming).
2. Form delivery-field exposure and save-overwrite hazard.
3. `Vary: Origin, Referer` missing on `data.js` success responses — fix now even though TTLs stay at zero, so the future fallback starts from a correct base.
4. If the snapshot fallback is ever built on Hobby: publication drain for out-of-band writes needs an explicit Hobby-compatible answer (inline script drain + opportunistic admin drain + manual retry UI; external scheduler only with user's explicit approval).

## Exact gates

- **G0**: env guard proves rejection of production credentials before server start (unchanged from plan).
- **G1**: verification matrix items 1–10 pass on local mocked fixtures with an isolated production build; save→next-normal-load shows the revision for every write path (widget/before-after/form/business/domains/review-sync/CLI scripts) with data at no-store — no purge involved.
- **G2**: on a preview deployment only: bundle CDN HIT after priming, 200/304 header consistency, hashed-URL rewrite wins over existing `public/` files, promotion *and* rollback serve the correct bundle+data through every alias.
- **G3**: revocation test — remove a domain, next new load denied, no process restart.
- **G4 (only if the snapshot fallback is later pursued)**: pointer-advancement concurrency tests locally; middleware admission-before-CDN ordering proven on isolated preview; Hobby-compatible drain mechanism implemented and tested for out-of-band writes; retention/no-GC policy specified. Until G4 passes, no `Vercel-CDN-Cache-Control` on any mutable data route, and the plan's status line must continue to say long-lived caching is unfinished.

One residual unknown for the parent agent: whether current traffic volume makes origin-per-visit data reads a cost concern on Hobby function limits — I could not assess that from the repo; it should be measured during Phase 0/1 baseline capture rather than assumed.

## Intermediate server-code review dispositions

Kimi K3 reviewed the in-progress server transport, cache aliases and test-isolation code through a second CLI invocation; exit code 0. The raw review follows. This review intentionally excluded loader and form submission internals and is not final approval of the full change.

- Accepted: the Playwright config had a malformed boolean expression. It prevents config loading; syntax failure itself stops execution, rather than permitting mutations. Fix and validate actual config discovery.
- Accepted verification gate: ensure `public/widget.js` is included in the production route file trace, since every renderer alias reaches that route. The existing deployed route already reads this file successfully; local file tracing and an isolated production-server check add evidence, but preview deployment still needs verification.
- Rejected: origin-scoped bootstrap records must be keyed by the **API/script origin**, which is the loader's data-source identity. Keying by the embedding client's origin would break that contract. Origin/Referer admission is a separate decision.
- Rejected: denying all missing-Origin/Referer bootstrap requests would change the explicitly preserved public-bootstrap policy. JSON APIs retain their stricter behavior. Referrer admission is not represented as authentication.
- Accepted: simplify mutation tests to a freshly started loopback server with explicit isolated backend credentials; review wildcard/default project selection and dedicated RLS checks. Canary checks are read-only and explicitly selected, distinct from mutation targets.
- Deferred: a before/after field whitelist beyond the currently public schema is future hardening, not required to remove the known form-delivery exposure.

## Kimi K3 intermediate server-code review (verbatim)

Review complete — bounded to transport/cache/aliases and test isolation. Findings below; loader/form-submit internals were not reviewed.

## P0

**1. `playwright.config.ts:43-47` — config file is unparseable; every Playwright run dies before the guard executes.**
```ts
const runningMutations =
  process.env.E2E_RUN_MUTATIONS === 'true' ||
  [...requestedProjects].some(...),   // ← comma, not ||
  requestedProjects.size === 0;
```
In a `const` declaration the comma starts a second declarator, so `requestedProjects.size === 0` is a syntax error (`Variable declaration expected`). The config cannot load at all — meaning the fail-closed `assertE2EEnvironment` call at line 51 never runs either, so the entire mutation gate is currently inert. Minimal fix:
```ts
const runningMutations =
  process.env.E2E_RUN_MUTATIONS === 'true' ||
  [...requestedProjects].some((p) => p === 'mutation' || p === '*') ||
  requestedProjects.size === 0;
```
This is an implementation gap, not a proof gap — `npx playwright test --list` will reproduce it.

## P1

**2. `src/app/api/embeds/widget/[id]/data.js/route.ts:125-138` — origin-scoped store is keyed by the serving origin, not the embedder's.**
`new URL(request.url).origin` is the app's own host — a constant. All embed sites collapse into one bucket, so `__BBS_WIDGET_DATA_BY_ORIGIN__` provides zero per-origin isolation, and a loader that looks up by embedder origin will never hit. Minimal fix: reuse the already-computed `origin` from `getRequestOrigin(request)` (line 49), with an explicit fallback key for null. Coordinate with the in-progress loader so writer/reader agree on the key.

**3. `data.js` route:90 — allowlist is advisory, not enforced; inconsistent with the JSON GETs.**
`if (origin && !isOriginAllowed(...))` lets any request with no Origin/Referer through, and the response always carries `Access-Control-Allow-Origin: *`. The JSON GETs fail closed on null origin (`domain-utils.ts:53`), and Referer is trivially suppressed (`referrerpolicy="no-referrer"`, curl). Decide explicitly: if the allowlist is access control, fail closed here too; if the bootstrap payload is public-by-design now that form private fields are stripped, document that and drop the theater. Payload sensitivity is low post-DTO, which is why this isn't P0.

**4. `src/app/api/embeds/widget.js/route.ts:12,19` — runtime read of `public/widget.js` from the function filesystem (verify on preview).**
Vercel serves `public/` from the CDN and typically does not place those files in the serverless function bundle. With the new `beforeFiles` rewrites (`next.config.ts:10-21`), *every* script alias — `/widget.js` and all 16-hex hashed legacy names — now depends on this function, so a missing file is a full embed outage (500 + alert). Local tests pass because the file exists on disk; they cannot prove function-bundling behavior. Verify on a preview deploy; if confirmed, fix with `outputFileTracingIncludes` or by inlining the bundle into the function at build time.

## P2 (material only)

- `e2e-environment-guard.ts:85-92` — canary branch rejects only `custom-widgets-phi.vercel.app` (via substring), not the other `KNOWN_PRODUCTION_HOSTS` (`builtbyshahwidgets.com`, `app.designdetail.io`). Canary is read-only so impact is low, but it contradicts the stated reject-even-opt-in list. One-line fix: check the canary hostname against `KNOWN_PRODUCTION_HOSTS`.
- `playwright.config.ts:94-109` — two robustness gaps: when `E2E_BASE_URL` is an allowlisted preview, the webServer block still starts a local dev server while polling the remote `url` for readiness; and when E2E creds are absent (`!hasServiceRole`) the webServer silently becomes `undefined`, so readonly local runs fail with connection-refused rather than a clear skip.
- `widget-public-payload.ts:127-135` — `buildBeforeAfterPayload` spreads the raw DB row (no whitelist like forms). Harmless today if `before_after_widgets` has only public columns; any future private column leaks. Optional hardening.

## What checks out

- Cache split matches the decision: script gets browser `max-age=0, must-revalidate` + `Vercel-CDN-Cache-Control: max-age=86400`; all mutable data and every error/403/404 path is `no-store` on both browser and CDN directives.
- `Vary: Origin, Referer` present on all allowlist-dependent responses (`domain-utils.ts:104,114`, `data.js` route:19).
- Allowlist load failure fails closed with 503; strict empty-whitelist semantics in `isOriginAllowed`.
- Guard correctly: rejects the known production Supabase ref and all four known production hosts as mutation targets, requires exact ref match, dedicated E2E creds, `E2E_ALLOW_MUTATIONS=true`, and blocks `E2E_SKIP_WEBSERVER` for mutations. `isolatedWebServerEnv` covers every Supabase/env alias the app reads (`db.ts`, `supabase/env.ts`) and blanks Resend/Scrapedo/Places keys. The final inherited-credential check (lines 149-155) is dead code (ref already rejected at line 107) — harmless.
- Middleware public-path scoping is correct: mutations on public-GET paths still require auth (the security spec's 401 assertions are consistent with the code); rewrites shadow stale `public/widget.*.js` files as intended; `safeJsString` escapes `<`/U+2028/U+2029.

## Caveats (per scope, not overclaimed)

- The 86400 CDN TTL bounds staleness even if a daily worker is delayed — accepted by the decision.
- `no-store` cannot erase responses already cached before this deploy; only TTL expiry or purge does.
- Local Playwright runs cannot prove CDN caching behavior — finding 4 and the TTL behavior need the canary/preview pass.


## Astra implementation reviews and fixes

Astra repeatedly reviewed the evolving diff without changing files. Accepted findings and implemented corrections:

- Serialize the full bootstrap payload once and assign the legacy global by reference. This prevents the origin-scoped compatibility addition from duplicating all review bytes again.
- Validate nested form steps, fields, options, rules and validation before treating bootstrap as authoritative.
- A failed completed blocking bootstrap must allow an unknown widget one fresh async attempt; known registry widgets can immediately use their legacy fallback.
- Preserve the exact server form fingerprint through the JSON fallback as well as bootstrap. Public mapping must not erase private editor destinations/storage policy, but full editor rows must still support intentional clears.
- Treat missing widget data as 404 and a database query failure as unavailable, with no-store headers; include HEAD/preflight/error outcomes.
- Mutation tests must use a freshly launched exact loopback app, dedicated allowlisted backend credentials and no server reuse. Reject every nonempty skip-server value, including false-looking strings. Do not trust remote app URLs without backend identity proof. Wildcard project selection and per-suite guards must close alternative entry points.

Astra verified the main payload/form/retry fixes and mutation-isolation blockers by inspection. Its final small config follow-ups were to remove a temporary debug line and prevent loader-only fixture runs from launching Next even when E2E credentials are present.

## Final Kimi K3 CLI review dispositions

The third CLI invocation explicitly selected `kimi-code/k3` with the read-only plan agent and exited 0. It reviewed the loader, runtime, all four wrappers, form mapping and submission, and supporting transport/tests. It found no P0/P1 defect and independently confirmed all three main Astra fixes.

- Accepted P2: null-resolved bootstrap/runtime promises must not poison a later newly inserted same-ID placeholder after a transient failure. Both failed-result caches now evict null/rejected results, while successful snapshots remain shared. Failed injected tags are removed and known failed host tags are remembered without deleting host markup. This does not introduce polling or retries for already failed stationary nodes.
- Accepted limitation, not selected for speculative cancellation: a renderer can inject data before the HTML parser reaches a later customer data tag, causing one extra request. JavaScript cannot know future markup. Waiting for DOM readiness would reintroduce the original latency problem, and removing an already started script does not reliably cancel its HTTP request. The generated data-first async snippet avoids this case; late/reversed arbitrary markup remains functional.
- Deliberate compatibility tradeoff: a copied `data-bbs-mounted` marker with no root is treated as foreign ownership. Page builders should insert an unmounted placeholder; the new runtime does not clear another renderer's marker speculatively.
- Invalid completed data resolves to fallback/failure; retries are reserved for bounded network/timeout failure. This avoids retry loops on structurally invalid or unsupported data.
- Reviewer proof-gap update: after the review prompt was sent, actual both-async built-server Chromium checks, mixed original/current bundle orders and normal reload/form-staleness checks passed. Provider CDN/deployment behavior remains unverified.

## Kimi K3 final code review (verbatim)

Review complete. I read all target files plus the supporting routes/tests needed to verify integration claims (`data.js/route.ts`, `widget.js/route.ts`, `form-widgets/[id]/route.ts`, `widget-public-payload.ts`, `cache-headers.ts`, `prefetch.ts`, `bootstrap.test.ts`, `embed-runtime.test.ts`, `form-config.test.ts`, SOP snippet). No files modified, no shell/tests run.

## Verdict on the three Astra fixes — all sufficient

- **Duplicated serialized payload** — fixed correctly. `src/app/api/embeds/widget/[id]/data.js/route.ts:131-137` serializes once and aliases the legacy global to the same object reference. Deleting the legacy map entry cannot affect the by-origin entry (separate own properties), so no aliasing hazard.
- **Malformed form nested fields** — fixed correctly. `isFormConfig` (`src/lib/bootstrap.ts:225-260`) deep-validates steps/fields/options/validation/visibilityRule before any component sees the payload; test at `src/lib/bootstrap.test.ts:89-96` covers it.
- **Failed blocking bootstrap retry** — fixed correctly. `isCompletedBlockingScript` (`src/lib/bootstrap.ts:390-405`) uses document-order vs `currentScript`, which is sound: a parser-blocking tag preceding the bundle tag has always completed before an async/deferred bundle can execute. Unknown IDs get exactly one async replacement attempt (`bootstrap.ts:498-510`); known legacy IDs fall back immediately via `embed-runtime.ts:237-240`. Tests at `bootstrap.test.ts:125-145,185-209` cover both orderings.

## Confirmed requirements

- Fingerprint retained on both paths: bootstrap (`bootstrap.ts:311-327` → `FormEmbed.tsx:27-29`) and JSON fallback (`publicFormResponse` top-level `schemaFingerprint` → `FormEmbed.tsx:42-44`). Submit route rejects mismatches at `route.ts:184-195` and shape drift at `route.ts:197-203`, both strictly before storage (`route.ts:283`) and delivery (`route.ts:301,311`). Client surfaces the "form changed" message correctly (`FormWidget.tsx:169-177,184-188`).
- Public DTO cannot clobber private editor fields: `PUBLIC_FORM_COLUMNS` excludes delivery/storage columns (`widget-public-payload.ts:65-109`); `formFromDbRow` presence flags + `formToDbRow` conditional serialization (`form-config.ts:361-365,480-489`) hold.
- Valid snapshot suppresses refetches (`GoogleReviewsEmbed.tsx:47,78`, carousel/BeforeAfter/Form equivalents); canonical business mapped exactly once server-side (`widget-public-payload.ts:125`) and never re-mapped client-side.
- No duplicate mount / no foreign-root destruction: origin-keyed runtime store + synchronous marker claim + ownership re-check at mount (`embed-runtime.ts:297-322`); detach/reinsert and ID-change handling verified by `embed-runtime.test.ts:130-164`. Two isolated-origin runtimes racing the same placeholder lose gracefully (second sees foreign root/marker and skips, never clears).
- Transport matches the stated design: data.js is no-store on all three cache headers (`cache-headers.ts:8-12`, used at data.js `route.ts:142`); widget.js is browser-revalidated with Vercel-only 86400 (`cache-headers.ts:25-31`, `widget.js/route.ts:47,58`) with in-memory ETag.

## Findings — no P0/P1. Two material P2s.

**P2-1: `loadBootstrap` caches `null` for the page lifetime — no retry for late same-ID placeholders.**
`src/lib/bootstrap.ts:599-605` (and the second layer at `src/lib/embed-runtime.ts:266-273`). Repro: transient network failure exhausts both bounded attempts for a new (non-registry) widget → promise store holds `Promise<null>`; a site builder/SPA then inserts another placeholder with the same ID (or re-inserts the node after the failure) → `loadData` returns the cached null → immediate `failed`, no retry, and no JSON fallback for unknown IDs. The Astra retry fix only helps within one mount attempt. Minimal fix: evict null-resolved entries, e.g. after `store?.promises.set(key, promise)`, add `promise.then((v) => { if (v === null) store?.promises.delete(key); })` so a later placeholder gets one fresh bounded attempt (EmbedRuntime's `dataPromises` needs the same treatment or should not cache nulls).

**P2-2: duplicate data.js fetch when the parser has not yet reached a later data.js tag.**
`src/lib/bootstrap.ts:503-510` injects whenever no matching tag is in `document.scripts`, even while `document.readyState === 'loading'`. Repro: `<script async src=".../widget.js">` in `<head>`, then a slow parser-blocking resource, then the data.js tag later in the body — widget.js executes before the parser reaches the data.js tag, injects a duplicate async data.js; the real tag loads too. Consequence is bounded (one extra no-store request; reassignment and the ready event are idempotent), and the SOP snippet (`docs/SOP-widget-deployment.md:155-160`, both tags async, data.js first) avoids it — but the SOP ordering is precisely what guarantees the tag is already in `document.scripts`, so any customer deviating from it (widget.js in head, data.js at end of body) pays a double fetch on every page load. Minimal fix: when `readyState === 'loading'` and no matching tag exists, still inject (needed for legacy one-script embeds) but observe for a parser-inserted matching tag and cancel/remove the injected one if the real tag appears first.

## Minor (P3, noting for completeness, not blocking)

- Stale-marker skip: a placeholder serialized/copied after mounting (builder duplicating a mounted section via innerHTML, Turbolinks-style morphs) carries `data-bbs-mounted="true"` with no shadow root → `embed-runtime.ts:213-219,303` permanently marks it `failed`. Deliberate tradeoff for legacy renderers that mark without shadow roots, but worth a documented note since GHL/Wix editors copy DOM.
- On the invalid-data `load` path (`bootstrap.ts:540-548`) there is no retry (only error/timeout retry). A data.js that executes but assigns nothing valid resolves null immediately. Acceptable; just asymmetric with the error path.

## Proof gaps (not bugs)

- The 20-trial Chromium evidence covers one fixture ordering (blocking data.js before async bundle, 3s parser block). The SOP's *both-async* ordering and the reversed/late-tag ordering (P2-2) have no browser evidence; local production-build HTTP validation is still in progress as you noted. The Vercel-only CDN behavior (`Vercel-CDN-Cache-Control` stripping on non-Vercel platforms) has no deployment proof — headers are correct in code, unverified in production.
- jsdom tests cannot prove real parser-blocking timing; `isCompletedBlockingScript`'s ordering argument is sound by HTML spec but only the single fixture trial exercises it in a real engine.
- I did not re-verify server-side allowlist/absent-Origin behavior beyond confirming the data.js gate at `route.ts:94` matches the stated intent (absence allowed), per your instruction that server changes were reviewed separately.


## Kimi K3 focused recovery follow-up (verbatim)

The fourth explicit `kimi-code/k3` CLI invocation exited 0. It reviewed only the failed-result eviction/retry correction and its tests.

## Verdict: resolved

The earlier P2 defect — a cached `null` promise poisoning later same-ID placeholders — is fixed at both cache layers, and the new tests genuinely exercise recovery. Bounded to the requested files only.

**Null/rejection eviction (both layers, race-safe)**
- `src/lib/bootstrap.ts:629-643`: eviction runs inside the `then` that *produces* the cached derived promise, so it executes before any continuation attached by callers — a later `loadBootstrap` after a settled null always sees a clean map. The `store.promises.get(key) === promise` identity guard prevents evicting a newer entry, and rejections evict too.
- `src/lib/embed-runtime.ts:272-281`: same pattern on `dataPromises`; the eviction reaction is attached inside `loadData` before the placeholder's `.then` at `src/lib/embed-runtime.ts:243`, so no ordering race between eviction and a new placeholder's cache lookup.

**Failed-script hygiene**
- Errored/load-without-data scripts are recorded in the `failedScripts` WeakSet (`bootstrap.ts:557-566`) and excluded from adoption on later attempts (`bootstrap.ts:500-505`); injected tags are also removed from the DOM on retry (`bootstrap.ts:571`) and on final miss (`bootstrap.ts:537`), so a later same-ID caller can neither adopt a dead tag nor mistake a removed one for in-flight.
- Retry recursion (`bootstrap.ts:568-578`, `585-595`) cleans up listeners/timers before chaining, passes prior scripts via `ignoredScripts`, and resolves the outer promise from the recursive attempt — no double-settle (`settled` guard intact) and no listener leak.

**Tests exercise the recovery, not just the failure**
- `bootstrap.test.ts:185-207` ("evicts an exhausted miss…") awaits the first null, then re-calls `loadBootstrap` and asserts a brand-new injected tag (not the old one) appears and itself gets a bounded retry — this fails if the null promise were still cached or the old tag left in the DOM.
- `bootstrap.test.ts:209-230` covers the host-supplied async tag variant (failed host tag remembered, fresh injection on later call).
- `bootstrap.test.ts:258-281` asserts zero injected tags remain after the single post-blocking-failure attempt — directly verifying cleanup.
- `embed-runtime.test.ts:166-187` fails the first placeholder with `null` (no mount), mounts a second same-ID placeholder, and asserts `loadBootstrap` was called again and the second mounts — this fails if `dataPromises` still holds the null entry.

**One benign observation, not a defect:** the mid-chain timeout-retry path (`bootstrap.ts:585-591`) adds timed-out scripts only to the per-chain `ignoredScripts`, not to `failedScripts` — a slow-but-alive host tag can still be adopted by a future fresh attempt, which is arguably desirable, and the final-attempt timeout does mark all scripts failed (`bootstrap.ts:593`). Within the accepted limitation you noted, I found no remaining race, cleanup, or retry defect in the scoped lines.


## Final validation and disposition

Astra's final bounded inspection verified the project-selection propagation fix: top-level default runs clear inherited selectors, workers retain the actual selected project, loader-only runs bypass backend validation/server startup, and mutation guards still require the exact newly launched loopback target. It also accepted the final form-validator type checks. No concrete remaining blocker was found in that scope.

Final local results: 68 unit tests passed (one explicitly disabled live RLS test skipped); three committed Chromium loader tests passed; TypeScript passed; ESLint over all 36 changed TypeScript/JavaScript files had zero errors and five existing FormWidget warnings; 14 synthetic CLI/config isolation cases passed. One ordinary local E2E test was intentionally skipped without dedicated credentials. Synthetic built-server checks passed 12 HTTP groups, six additional missing/access checks and six browser assertions. Final supported Webpack production build and generated-bundle tracing passed. Full repository lint still fails on one unchanged editor error; the default Turbopack build is blocked by local subprocess port permissions.

The final generated renderer measured 99,370 bytes / 31,545 bytes gzip (baseline 87,124 / 27,692). Twenty controlled parser-stall visits per version measured 3,029.15 ms baseline median vs 24.20 ms final median; final p95 33.10 ms. Every final first render occurred while parsing was still in progress, with two widget requests instead of four and no browser exceptions. This is a local scheduling experiment, not production/CDN latency evidence. The [handoff](2026-09-21-widget-serving-handoff.md) contains final hashes, file-by-file effects and release limits.

No deployment, push, live database action, migration, external delivery or cache purge was performed. Long-lived mutable-data caching remains unfinished. No reviewer claim is used as a substitute for provider verification.
