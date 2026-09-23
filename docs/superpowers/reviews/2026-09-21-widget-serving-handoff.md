# Widget serving implementation handoff

Branch: `codex/widget-serving-plan`. Implementation base: `f67534d`; original application baseline: `36f5d0b`.

## Review findings and release limits

Astra and Kimi K3 found no remaining high-priority code defect in their reviewed scopes. Kimi verified the final failed-load recovery fix. The local validation results are recorded below; provider release checks remain open.

The selected Vercel Hobby implementation removes host-DOM waiting, redundant data requests, duplicate review payload fields and avoidable public-route auth setup. It keeps customer URLs stable and requests CDN caching for the shared renderer. Mutable data uses explicit no-store directives to preserve next-load freshness; long-lived data caching and publication infrastructure remain unfinished. Origin/database latency and Hobby function usage therefore remain relevant.

No deployment, push, production database change, migration, review sync, cache purge, customer HTML edit or external delivery was performed. All mutation checks used synthetic data on a localhost fake Supabase server. No production credentials were passed to builds or fixtures.

Provider verification remains a release gate: Vercel renderer HITs, aliases, normal reload after a save, domain policy, deployment promotion and rollback, and transition from previously cached responses. Local evidence cannot establish those properties or a production speedup. Retained hashed aliases now serve current bytes; customer SRI/CSP hashes require compatibility checks. Existing parser-blocking customer markup remains parser-blocking until optionally updated to the new async snippet.

Full lint has one existing error in unchanged `src/components/editor/before-after-tabs.tsx:391` (`react-hooks/set-state-in-effect`). The default Turbopack build hit a sandbox port-binding restriction. The supported Webpack production build passed, including TypeScript and route tracing; this does not establish that the default Vercel build passes.

## Implemented behavior

- The runtime mounts each placeholder as soon as its data and renderer are available. `DOMContentLoaded` is a recovery scan rather than a start gate. Host JavaScript can still occupy the main thread.
- Valid bootstrap data is the snapshot for that mount. All four wrappers skip their redundant JSON requests. Canonical business metrics are mapped once, preserving the rating/count on first paint.
- New snippets use two async classic scripts at stable URLs. Old blocking snippets, legacy attributes, repeated scripts and newly created IDs remain supported. Owned roots are cleaned up on removal/ID changes; foreign roots remain untouched.
- Shared renderer: browser/generic CDN revalidation, Vercel CDN freshness of 86,400 seconds. Bootstrap and fallback JSON: no-store at all three cache-header layers. Domain policy is read afresh, with controlled failure when unavailable.
- Public forms omit delivery destinations and storage policy. Private editor settings survive public mapping. New forms submit their schema fingerprint; stale schemas are rejected before storage/delivery with reload guidance. Legacy renderers without fingerprints retain validation but cannot detect every same-shape semantic edit.
- Tests requiring a real backend use separate, explicit E2E credentials and guards. The independent loader suite intercepts its network and needs no Supabase credentials.

## Verification

- `npm run test:unit`: **68 passed, 1 skipped**, across 12 passing files and one intentionally disabled live RLS file.
- `npm run test:e2e:loader`: **3 passed** in real Chromium using the generated bundle and fully intercepted requests.
- `npx tsc --noEmit --incremental false`: passed.
- ESLint over all **36 changed TypeScript/JavaScript files**: zero errors; five existing FormWidget warnings. Full `npm run lint`: one unchanged editor error and 13 warnings, as described above.
- `npm run build:widget`: passed. Final `npx next build --webpack`: passed; the route file trace contains `public/widget.js`. The default `npm run build` failed on Turbopack's local port-binding permission, not a reported compilation/type error.
- **14 CLI/config guard cases passed**: missing isolation, wildcard selection, explicit production opt-in, remote app allowlisting, mismatched port, false-looking skip flag, backend-independent loader selection, stale selection markers and local/canary/loader worker reevaluation. These were config discovery/import checks; no real backend was contacted. The tsx CLI's IPC permission issue was avoided using its in-process Node loader.
- `npm run test:e2e` without dedicated credentials: **1 intentionally skipped**; live CRUD, real RLS and production canary tests were not run.
- `git diff --check` and the 41-file handoff inventory check passed.

Builds and ad hoc backend checks used a sanitizer that shadows every `.env` key and injects only fake localhost Supabase values, disables external delivery and disables live harness/RLS access. The synthetic Next/Supabase servers were stopped after testing. Browser checks blocked every external hostname.

Independent actual-IIFE browser comparison used 20 visits per version with a deliberate three-second host parser stall. Baseline median first render was **3,029.15 ms** (p95 **3,035.20 ms**), with four widget requests. The final bundle median was **24.20 ms** (p95 **33.10 ms**), with two requests, no browser errors, and correct 4.8/123 metrics while `document.readyState` was `loading` on every trial. No initial trial was discarded. This isolates the DOM wait and duplicate fetches; it does not measure cold Vercel/Supabase/network latency or establish a production percentage speedup.

Final generated IIFE: 99,370 bytes, 31,545 bytes gzip, SHA-256 `f3936c37bcd3bfb5cfee6838d89f8487ed7b152ebd87a7d7d6aecc4a7dcbfd80`. Baseline: 87,124 bytes, 27,692 bytes gzip, SHA-256 `eda97f36352622dcbe186f31c948eec4c74981ba06c4bdc5477a8f39d05376dc`. Runtime validation, coordination and lifecycle handling add **3,853 gzip bytes**; lower request count and earlier scheduling are measured separately from bundle size. Generated bundles remain ignored build output.

The built Next server, backed only by the synthetic localhost Supabase fixture, passed 12 HTTP groups: renderer aliases and zero auth/DB work; ETag/304/HEAD; canonical bootstrap; Origin/Referer combinations; JSON GET/HEAD/OPTIONS; public form filtering; anonymous writes; synthetic authenticated save followed by a fresh request; direct committed changes; immediate domain revocation; policy-query outage; stale-form rejection. Six additional checks covered five no-store 404 endpoints and an anonymous private-form read. These are ad hoc integration checks, not a committed server test suite or live RLS tests.

Six real Chromium checks against that production build passed: actual bootstrap with two widget requests; open snapshot stability followed by updated metrics on ordinary reload; exact form fingerprint and visible 409 reload guidance with no stored submission; updated form schema on ordinary reload; carousel selection from bootstrap without duplicate JSON; no unhandled browser exceptions. Mixed actual original/current IIFEs also passed data-after-bundle, unknown ID, old-first, new-first and old-owned-root cases. The old-owned case deliberately retains the older renderer's behavior until its normal fallback completes.

## File-by-file change report

Verification terms below: **unit** means isolated Vitest; **loader browser** means the intercepted Chromium suite; **built HTTP/browser** means the synthetic-backend production-build checks described above; **static** means code review/type/lint checks and is not a claim of production execution. The final validation section gives exact counts and limitations.

### Runtime and renderer

**[src/embed.tsx](../../../src/embed.tsx)** — Connects bundle-origin capture, validated bootstrap loading, Preact mounting and cleanup to the shared runtime. This removes the DOM-ready start gate and allows independent widgets to progress. Existing marker/root ownership is preserved; main-thread congestion remains possible. Verified by unit dependencies, generated-IIFE browser cases, mixed-version checks and built browser checks.

**[src/lib/embed-runtime.ts](../../../src/lib/embed-runtime.ts)** — New per-origin runtime owns placeholder state, origin/ID promises, immediate scanning and a targeted MutationObserver. Repeated scripts share work, same-ID placeholders mount separately, and owned removed/changed nodes are torn down. Foreign roots are intentionally not repaired or replaced; the observer remains active for late page-builder insertions. Verified by runtime unit and loader browser tests plus mixed-version execution.

**[src/lib/bootstrap.ts](../../../src/lib/bootstrap.ts)** — Adds runtime validation, API-origin-scoped lookup, shared readiness coordination, legacy script adoption, load/error detection and bounded retry. It preserves assignment-only bootstrap compatibility and canonical business metrics. Invalid data falls back; a genuinely stalled request still has a bounded timeout, and ambiguous old ID-only values from different API origins are rejected. Verified by bootstrap unit and real-IIFE browser tests; Astra reviewed ordering and retry fixes.

**[src/widget-registry.ts](../../../src/widget-registry.ts)** — Extends component props with a captured bootstrap snapshot and resolves widget kind from validated payload data. New IDs no longer require a registry entry or redeploy; the registry remains the known legacy fallback. Unsupported payload kinds fail validation. Verified by TypeScript, unknown-ID and multi-kind loader cases.

**[src/components/GoogleReviewsEmbed.tsx](../../../src/components/GoogleReviewsEmbed.tsx)** — Captures the bootstrap once, preserves canonical business metrics and suppresses config/review refetch effects after valid bootstrap. Legacy fallback remains. Open widgets keep their accepted data; malformed/missing bootstrap can still require extra requests. Verified by canonical mapping tests, request-count checks and ordinary-reload browser evidence.

**[src/components/GoogleReviewsCarouselEmbed.tsx](../../../src/components/GoogleReviewsCarouselEmbed.tsx)** — Applies the same snapshot and canonical-business handling to the carousel. Its fallback remains available and open content does not live-refresh. Verified by TypeScript, shared contract tests and the built-browser carousel case; no claim of full visual regression coverage.

**[src/components/BeforeAfterEmbed.tsx](../../../src/components/BeforeAfterEmbed.tsx)** — Captures valid bootstrap configuration and skips the duplicate settings fetch. Unknown IDs can mount from the bootstrap kind. Image download time and host layout remain independent costs. Verified by loader browser, lifecycle tests and public-route HTTP checks.

**[src/components/FormEmbed.tsx](../../../src/components/FormEmbed.tsx)** — Captures the public bootstrap and forwards its exact schema fingerprint; the JSON fallback also captures the server fingerprint. This avoids duplicate fetches and gives submissions the version the visitor actually saw. Legacy payloads without fingerprints retain older validation limits. Verified by static review and built browser fingerprint/stale-form checks.

**[src/components/FormWidget.tsx](../../../src/components/FormWidget.tsx)** — Adds the schema fingerprint to submissions and shows the server's reload instruction for stale forms. Ordinary errors retain the configured error message. An edited form can require a visitor to reload/re-enter data; destinations still come from the server. Verified by built Chromium stale-submit/no-storage checks and TypeScript; full design/accessibility regression was not run.

**[src/components/WidgetsHome.tsx](../../../src/components/WidgetsHome.tsx)** — Generates both stable script tags with `async`, enabling overlap and either execution order. Already pasted HTML is unchanged; updating it is optional and outside this branch's operational actions. Verified by code inspection and equivalent actual-browser async ordering tests.

### Public transport and form safety

**[src/lib/widget-public-payload.ts](../../../src/lib/widget-public-payload.ts)** — New shared payload builders add schema version 1, canonical metrics/reviews, a public form allowlist, fingerprints and safe script serialization. Reviews leave the config duplicate removed; form private delivery/storage settings remain server-side. New public form columns must be deliberately added to the allowlist. Verified by payload units and built HTTP/body checks, including compatibility of missing business data.

**[src/app/api/embeds/widget/[id]/data.js/route.ts](../../../src/app/api/embeds/widget/[id]/data.js/route.ts)** — Overlaps admission/data reads, builds the canonical payload, serializes it once, shares references between old/new globals and emits readiness. It returns explicit no-store/Vary headers and controlled unavailable/not-found responses. Each visit still invokes origin/database work; independent table writes are not made atomic. The existing missing-Origin/Referer policy is retained. Verified by built HTTP, ordinary reload, unknown-ID browser checks and review of the single serialization.

**[src/app/api/embeds/widget.js/route.ts](../../../src/app/api/embeds/widget.js/route.ts)** — Applies the split renderer cache policy consistently to 200/304 and no-store to failure; remains dynamic with its in-process file cache/ETag. Stable URLs can use Vercel CDN freshness while browsers revalidate. Provider cache behavior and bundled-file availability still require preview validation. Verified by production build trace, same-byte aliases, GET/HEAD/304 and zero backend-request checks.

**[src/lib/cache-headers.ts](../../../src/lib/cache-headers.ts)** — Centralizes explicit browser/CDN/Vercel no-store policies for data and one-day Vercel renderer freshness. Removes the old 60-second data freshness/SWR window. This favors next-load correctness while potentially increasing warm origin latency/usage; old cached responses are not retroactively erased. Verified by all public endpoint HTTP header cases and review.

**[src/lib/domain-utils.ts](../../../src/lib/domain-utils.ts)** — Removes the five-minute process cache, adds a controlled admission-data error and varies responses on both Origin and Referer. Newly read revocations take effect without process restart. This adds allowlist reads and makes admission outages fail closed; referrer checks remain public-content policy rather than authentication. Verified by revoke/reallow, outage and origin-matrix HTTP checks.

**[src/middleware.ts](../../../src/middleware.ts)** — Returns early for explicitly public methods/routes before session setup and recognizes stable/historical script aliases. Protected mutations retain authentication. The installed Next version still warns about the existing middleware convention; migration to `proxy` is separate work. Verified by built anonymous mutation rejection and zero auth/DB calls for renderer aliases, plus static route-method review.

**[src/app/api/v1/widgets/[id]/route.ts](../../../src/app/api/v1/widgets/[id]/route.ts)** — Makes public reads dynamic/no-store, consistently handles domain failures and distinguishes missing data from query failure; writes also receive no-store responses. Known legacy fallbacks remain fresh, with increased origin reads. Verified by built GET/HEAD/OPTIONS, 404/outage, anonymous PATCH and synthetic authenticated save/read checks.

**[src/app/api/v1/widgets/[id]/reviews/route.ts](../../../src/app/api/v1/widgets/[id]/reviews/route.ts)** — Applies fresh admission, explicit no-store and controlled errors to review fallback reads/preflight. New valid bootstrap mounts normally avoid this request; older clients still use it. Verified by public method/header/404 HTTP checks and absence of redundant requests in the new browser path.

**[src/app/api/v1/before-after-widgets/[id]/route.ts](../../../src/app/api/v1/before-after-widgets/[id]/route.ts)** — Applies the same dynamic/no-store/admission/error behavior and no-store mutations. It preserves existing API shapes and auth boundaries. Provider behavior remains unverified outside local Next. Verified by public methods, missing-ID and anonymous mutation HTTP checks; not every authenticated CRUD path was exercised live.

**[src/app/api/v1/form-widgets/[id]/route.ts](../../../src/app/api/v1/form-widgets/[id]/route.ts)** — Separates public allowlisted configuration/fingerprint from an explicit authenticated `?view=admin` read, and applies fresh admission/no-store. Existing SSR editors retain private rows. API consumers needing delivery fields must authenticate through the private path. Verified by public field omission, anonymous private-read rejection, public methods/404 and mapping units; real admin identity/RLS was not exercised.

**[src/app/api/forms/[id]/submit/route.ts](../../../src/app/api/forms/[id]/submit/route.ts)** — Validates request shape and current schema fingerprint/answer choices before storage or external delivery; returns no-store and useful stale-form messages. Adds a test-only environment switch to suppress actual webhook/email dispatch. Fingerprints are change detectors, not authorization, and legacy clients cannot detect all semantic changes. Verified by built stale-form HTTP/browser checks and schema/answer unit tests; no real email/webhook was sent.

**[src/lib/form-config.ts](../../../src/lib/form-config.ts)** — Adds deterministic semantic schema fingerprints, current-answer shape/choice checks and private-field-presence metadata for safe serialization. Public defaults cannot overwrite stored private destinations, while private editor rows still support deliberate clears. Fingerprints are non-cryptographic; metadata must be preserved when copying an existing mapped config. Verified by mapping/fingerprint/choice tests and the stale-form integration case.

### Build and test infrastructure

**[next.config.ts](../../../next.config.ts)** — Moves stable and 16-hex historical renderer aliases into `beforeFiles` rewrites, overriding retained stale files, and explicitly traces `public/widget.js` into the serving route. This keeps pasted URLs usable after deployments. Changing bytes under a historical hash can conflict with customer SRI; provider packaging still needs preview proof. Verified by the built route trace and identical bytes/ETags for canonical, stable, retained historical and synthetic historical aliases.

**[scripts/build-widget.mjs](../../../scripts/build-widget.mjs)** — Writes a stable `widget-manifest.json` pointing to `widget.js` in build and watch modes. The renderer remains a generated ignored artifact. Old separately cached manifests/bytes still need rollout handling. Verified by bundle generation and manifest inspection; watch mode reviewed statically.

**[package.json](../../../package.json)** — Adds explicit test commands/projects for guarded mutations and isolated loader checks. Existing dependency versions and lockfile remain unchanged. Operators must use the backend guard's dedicated environment for mutation suites. Verified by final command execution and Playwright project discovery.

**[playwright.config.ts](../../../playwright.config.ts)** — Separates rendering, mutation, canary and isolated-loader projects; masks application credentials for locally launched test servers and checks mutation targets before startup. Default/wildcard selection must fail closed rather than inherit production `.env`. Remote mutation servers are not trusted without identity proof. Verified by guard units and actual command discovery/failure checks; no production mutation suite ran.

**[src/lib/e2e-environment-guard.ts](../../../src/lib/e2e-environment-guard.ts)** — New fail-closed checks require dedicated Supabase credentials, explicit test-project allowlisting, safe local app targeting and mutation opt-in; isolate outbound-delivery environment. Test operators must provision a separate backend; a local app URL alone is insufficient. Verified by unit and CLI rejection cases, including production ref, skip-server and remote-target bypasses.

**[src/lib/e2e-environment-guard.test.ts](../../../src/lib/e2e-environment-guard.test.ts)** — Exercises the isolation rules with synthetic identifiers/credentials. This makes the production `.env` hazard and bypass fixes reproducible. It cannot attest to a real remote deployment's backend. Verified by the unit run and actual CLI gate checks.

**[src/lib/bootstrap.test.ts](../../../src/lib/bootstrap.test.ts)** — Adds schema/business/form validation, scoped provenance, assignment-only readiness, execution-order and retry regressions. These test the coordinator's decisions in jsdom. They do not emulate browser parsing/network scheduling; Chromium supplies that complementary evidence. Verified by unit tests.

**[src/lib/embed-runtime.test.ts](../../../src/lib/embed-runtime.test.ts)** — Adds repeated-runtime/shared-data, multiple-placeholder, foreign-root, ID-change and cleanup regressions. Mock mounting isolates lifecycle decisions; actual Preact/IIFE behavior is covered separately. Verified by unit tests.

**[src/lib/widget-public-payload.test.ts](../../../src/lib/widget-public-payload.test.ts)** — Covers canonical metrics, a single review array, omitted private form settings and JavaScript escaping. These constrain the public contract but do not prove CDN transport behavior. Verified by unit tests and built HTTP complements.

**[src/lib/form-config.test.ts](../../../src/lib/form-config.test.ts)** — Adds semantic fingerprint, stale answer/choice, public/private round-trip and intentional-clear regressions. This protects submission meaning and editor delivery settings. It does not test real delivery providers. Verified by unit tests.

**[e2e/embed.loader.spec.ts](../../../e2e/embed.loader.spec.ts)** — Adds intercepted Chromium tests using the actual generated bundle and synthetic payloads, including readiness and lifecycle behavior. It requires a local Playwright browser but no Next/Supabase service; external requests are blocked. It cannot prove provider caching or production latency. Verified by the final isolated loader run.

**[e2e/crud.local.spec.ts](../../../e2e/crud.local.spec.ts)** — Adds an explicit mutation-environment assertion before destructive CRUD tests. Existing CRUD logic is retained; this prevents generic inherited production credentials from authorizing it. Verified by guard/discovery checks only; the real CRUD suite was not run.

**[e2e/security.api.spec.ts](../../../e2e/security.api.spec.ts)** — Adds the same mutation guard and uses the dedicated test service role. This keeps security tests that seed records in the isolated mutation project. Verified by guard/discovery checks; no live backend seeding or full security suite execution.

**[e2e/embed.local.spec.ts](../../../e2e/embed.local.spec.ts)** — Uses dedicated E2E credentials/guarded local configuration instead of the generic application backend. Existing live-data rendering checks require explicit isolation setup. Verified by test discovery/skip behavior; synthetic loader/browser checks were run instead of this live-data suite.

**[src/lib/rls.lockdown.test.ts](../../../src/lib/rls.lockdown.test.ts)** — Requires the dedicated allowlisted E2E backend and explicit RLS opt-in rather than inherited generic credentials. The current run intentionally skips this live RLS check. Verification establishes the guard/skip behavior, not production RLS correctness.

### Documentation and evidence

**[docs/SOP-widget-deployment.md](../../SOP-widget-deployment.md)** — Documents async stable snippets, current serving domain, test isolation, Hobby transport, stale-form behavior, cache transition and preview/rollback gates. It distinguishes local validation from operational actions. Existing customer sites are not edited by this documentation. Verified against the implemented routes/snippet and observed local checks; provider steps remain pending.

**[docs/superpowers/plans/2026-09-21-widget-serving-performance.md](../plans/2026-09-21-widget-serving-performance.md)** — Records the authorized implementation and Hobby-safe decision while preserving the original conditional caching design. It explicitly marks long-lived data caching/publication work unfinished and describes the latency/usage tradeoff. This is a scope decision, not evidence of deployment. Verified against code, official provider constraints and supervisor dispositions.

**[docs/superpowers/reviews/2026-09-21-widget-serving-implementation-review.md](2026-09-21-widget-serving-implementation-review.md)** — Records Luna/Astra/Kimi roles, real CLI reviews, accepted fixes, corrected reviewer assumptions and remaining proof gaps. Raw reviewer claims are not automatically accepted facts; dispositions control the verdict. Verified against CLI outputs and the current diff.

**[docs/superpowers/reviews/2026-09-21-widget-serving-handoff.md](2026-09-21-widget-serving-handoff.md)** — This complete handoff explains every changed file, behavioral/operational effects, verification limits and remaining release work. It changes no runtime behavior. Verified by matching its file inventory to the final Git diff and its claims to recorded results.
