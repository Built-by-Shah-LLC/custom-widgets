# Kimi K3 adversarial review and resolution record

Date: 2026-09-21
Branch: `codex/widget-serving-plan`
Scope: planning documents and read-only source inspection; no implementation/deployment validation.

Final planning outcome: Kimi K3's focused second review found both P0s and all P1s addressed, with no remaining plan-level blockers. Its one non-blocking wording clarification has also been incorporated. This is reviewer approval of the plan, not user authorization or verification of implementation.

## Review provenance

- CLI: local Kimi Code CLI 0.41.0, `/Users/aliamin/.kimi-code/bin/kimi`.
- Explicit model alias: `kimi-code/k3`, configured to provider model `k3`; no model substitution.
- Effective command: `kimi --model kimi-code/k3 --agent plan --output-format stream-json --prompt <review instructions>`.
- The built-in `plan` agent was selected for read-only review. An initial `--plan --prompt` invocation failed before review because the CLI does not combine those flags; the documented agent profile resolved this.
- First completed review: exit code 0; 22 Read, 25 Grep, 2 Glob, and 2 FetchURL calls. The URL reads were Vercel's public cache documentation. No shell/write/database tools were used by the reviewer.
- Original draft SHA-256: `db57cccd2e04bb994396142b73826b3acce3faea30f8f1d599d8e1bd68d042a8`.
- The original verdict was **conditionally sound, not yet approvable**, with two P0 findings. The preserved review below refers to the original draft's line numbers, not the revised file.
- Raw CLI streams are temporary operational files under `/private/tmp`; this document preserves the user-relevant findings and dispositions without credentials or private payloads.

## Dispositions in the revised plan

1. **P0-1 — Undefined fallback:** addressed by a concrete revision-addressed snapshot/published-pointer fallback, including atomic generation checks, existing full-bootstrap compatibility, stable optional new resolver URLs, retained revisions, tombstones, and pre-cache admission for direct revision requests. Primary purge publication has a five-second synchronous budget, explicit pending state, and a 60-second backlog alert target. Neither alternative is presumed to meet performance goals; Phase 0 chooses one before schema work. If both fail, long data caching is explicitly unfinished rather than silently weakened.
2. **P0-2 — Mixed bundle ownership:** addressed with synchronous legacy marker writes, marker/root checks, external-root ownership rules, failure isolation, and actual old+new bundle tests in both orders.
3. **P1-1 — Old assignment-only bootstrap:** addressed with script `load`/`error` listeners and global re-reads before/after registration. DOMContentLoaded is not the primary readiness mechanism. A preceding blocking legacy script with missing data goes directly to fallback. This deliberately improves on the suggested DOMContentLoaded backstop, which could recreate the delay being removed.
4. **P1-2 — Variation and fragmentation:** addressed with an explicit 100-request/80%-HIT measurement decision and fallback selection. The existing missing-Vary success response is called out. Per-origin tags can narrow revocation purges but cannot reduce cache-key cardinality, so they are not presented as a fragmentation fix. Broad purge stampedes get a separate bounded concurrency check.
5. **P1-3 — Production test risk:** addressed as the first Phase 0 deliverable, with exact database/base-URL allowlists, known-production denial, dedicated credentials, external-delivery stubs, canary separation and a negative test before startup. The performance suite also gets an explicit Playwright project because the current pattern would omit it.
6. **P2-1 — Outbox scope:** simplified by removing leases from the initial correctness design; retained atomic triggers and generation completion. A route call after a write is not crash-safe atomic publication. An RPC alternative would require changing every writer, so the plan keeps one trigger-based source-of-truth boundary and defers schema work until the serving choice is made.
7. **P2-2 — Business mapping:** accepted the single-mapping principle, using the existing canonical camelCase wire format. The server maps once, the bootstrap reader validates without remapping, and the old JSON fallback maps its raw join once. Changing the public bootstrap to raw snake_case was rejected as an unnecessary compatibility change.
8. **P2-3 — Transition honesty:** added a communicated minimum 60-second browser-cache transition exception, inventory of historical longer policies, no artificial compatibility timeout after observable data/error, and rollback checks through serving aliases.
9. **P2-4 — Form fields:** explicitly scoped as existing public-field exposure hardening on both response paths. The plan notes that the shared mapper reads those fields and preserves private editor/server delivery configuration separately. It does not declare any real credential compromised without inventory and does not access or reproduce real delivery URLs.

## Remaining implementation gates

- Actual Vercel deletion propagation/in-flight fill behavior, response variation, admission-before-cache ordering, and cache behavior through promotion/rollback.
- Availability of isolated test infrastructure and supported worker scheduling.
- Performance of primary and fallback transports; document targets are not measured improvements.
- Inventory of old snippet/SRI/browser-cache policies and external manifest consumers.

The original review is evidence of adversarial planning, not proof that runtime code works or a provider gives stronger consistency than it documents. Application tests, migrations, deployed-preview checks and a later implementation-diff review are still required.

## Original Kimi K3 review (verbatim)

# Adversarial review — `docs/superpowers/plans/2026-09-21-widget-serving-performance.md`

Reviewer: Kimi K3 (read-only). No files were modified; no production, network-mutating, or database actions were taken. Sources inspected: the plan, embed/serving routes, loader, components, middleware, config, migrations, tests, and Vercel's published caching docs.

## 1. Verdict

**Conditionally sound, not yet approvable.** Every evidence claim in §2 that I checked against source is accurate (no invented problems), and the chosen architecture — stable URLs, async dual-script snippets, bootstrap-as-single-snapshot, split browser/CDN policy, tag purge gated on provider proof — is implementable against Vercel's documented behavior. However:

- The plan's own freshness guarantee rests on two unproven provider behaviors, and the fallback if they fail is an unnamed "stronger revision-aware serving design" (§3.4, line 103). That is a vague gate leaving core architecture undecided — decide the fallback now. (**P0-1**)
- Two concrete client-side races from the mixed-version transition are not covered by the design or the verification matrix. (**P0-2**, P1)
- The outbox/trigger machinery is mostly justified, but leases are droppable and the stampede/fragmentation tradeoffs need explicit decision criteria rather than "measure this."

## 2. Findings (ordered)

### P0-1 — Fallback architecture for the freshness contract is undefined

Plan: §3.4 line 103, §6 "Unresolved facts." The product guarantee ("next normal load after acknowledgement shows the save") depends on `dangerouslyDeleteByTag` propagating fast enough and no fill-after-purge reinsertion. [Vercel's purge doc](https://vercel.com/docs/caching/cdn-cache/purge) confirms invalidate serves stale on the next request (so delete is correctly chosen), but documents no propagation SLA and warns deletion is "not recommended" due to stampede. The plan correctly makes this a release blocker for long caching — but if the gate fails, the plan's contingency is "keep responses uncached/short-lived while selecting a stronger revision-aware serving design." That design is unnamed, so a Phase 0 failure leaves the project at an architecture decision point mid-implementation.

Correction (decide in the plan, with trigger criteria): name the fallback as the classic revision-addressed variant — `data.js` stays `max-age=0, must-revalidate` (CDN-uncached) as a tiny coordination document that emits a reference to an immutable, long-TTL revisioned payload (`/api/embeds/widget/<id>/rev/<updated_at-or-revision>.js`). Customer snippet URLs never change; freshness becomes a read-time property, and purge leaves the correctness path entirely. Costs one extra request on cold load; that tradeoff should be pre-weighed against purge risk, since the user has already been burned by stale-design regressions. Also state the acceptable bound on purge-acknowledgement latency, since under §1's contract propagation delay converts directly into save latency (write ack waits for purge completion).

### P0-2 — Mixed bundle versions on one page can double-mount or throw; not in the verification matrix

Plan §3.2 line 59 says DOM attributes become "compatibility markers, not the sole source of mount state" — it never says the new runtime **writes** the legacy marker. Failure scenario, grounded in source: the legacy hashed URLs in the wild (`widget.<16-hex>.js`) and the stable `/api/embeds/widget.js` are distinct browser-cache keys, so during a deploy one page can execute an old cached bundle plus the new bundle. The old bundle dedups only via `placeholder.dataset.bbsMounted` (`src/embed.tsx:130-131`) and unconditionally calls `placeholder.attachShadow({mode:'open'})` (`src/embed.tsx:134`). If the new runtime mounts first using only its `WeakMap`, the old bundle then calls `attachShadow` on a node that already has a shadow root — that throws `NotSupportedError`, aborting the whole `forEach` mount loop so remaining placeholders never mount; or it double-renders. Verification item 3 (§5) repeats the *same* bundle tag only.

Correction: the new runtime must (a) synchronously set `data-bbs-mounted='true'` (or check `placeholder.shadowRoot`) when it mounts, and (b) treat an existing marker/shadow root as mounted. Add §5 tests: old bundle + new bundle on the same page, in both execution orders.

### P1-1 — New loader can stall ~10 s against a cached old-format `data.js`

§3.2 line 57 assumes the data script always emits the readiness notification. During the transition, browser/CDN caches hold today's assignment-only format (`route.ts:115-117`; currently `s-maxage=60, stale-while-revalidate=300` — the ~6-minute window the user already knows). Scenario: new async snippet, CDN serves stale old-format `data.js`, bundle executes first and waits for a notification that never comes; only the 10 s timeout plus fallback rescues it. Not fatal, but it is exactly the "update made things slower/flakier" class of regression the user has hit before. Correction: loader performs one bounded re-read of `window.__BBS_WIDGET_DATA__[id]` at `DOMContentLoaded`/`load` (not polling), or the bootstrap gains a format stamp the loader uses to select read-at-DCL behavior. Add to §5 item 2.

### P1-2 — Origin-check × CDN-cache interaction lacks decision criteria

§3.5 line 109 says "measure this rather than weakening the check" but names no thresholds or fallback ranking. Observed facts: the access decision keys on `Origin` with `Referer` fallback (`src/lib/domain-utils.ts:44-58`); classic cross-origin `<script>` requests send no `Origin`, only `Referer` (origin-only under the default `strict-origin-when-cross-origin` policy, but full-URL under a host-set `unsafe-url`); Vercel's CDN does honor `Vary` but [explicitly warns against `Vary: Referer`](https://vercel.com/docs/caching/cdn-cache) for fragmentation; 403s are not in Vercel's cacheable status set (200/404/410/redirects only), which bounds poisoning risk to success variants. Also observed: today's `data.js` success response has **no** `Vary` at all (`route.ts:119-126`) while its 403 has `Vary: Origin` (`route.ts:63`) — an existing inconsistency the plan fixes but doesn't call out as a live 60-second poisoning window.

Correction: record the decision tree in Phase 0 — (a) measured hit rate with `Vary: Origin, Referer`; (b) if fragmented, add per-requesting-origin cache tags (e.g. `widget-origin:<host>`, response knows the origin) so revocation purges one variant instead of the namespace; (c) only then consider middleware-enforced allowlist, noting it puts an allowlist read in front of every CDN hit (needs an edge-cached allowlist to not erase the latency win). State the hit-rate threshold that triggers each branch.

### P1-3 — Mutation e2e suites can write to production today; the guard must be a hard gate, not a checklist line

Confirmed: `playwright.config.ts:7-12` auto-loads `.env.local`/`.env`; `e2e/security.api.spec.ts:18-31` issues real POST/PATCH/DELETE, and `crud.local.spec.ts` runs CRUD against whatever project those credentials point at. Plan item 21 (§5) covers this, but it is buried in a bullet list. Correction: make the environment guard a named Phase 0 deliverable with a defined mechanism (e.g. refuse to run mutation projects unless `SUPABASE_URL` matches an allowlisted test project or an explicit `E2E_ALLOW_MUTATIONS_AGAINST` token matches), and also guard `E2E_BASE_URL`/`E2E_CANARY_URL` for mutation-bearing specs. This is the cheapest item in the plan and the only one that can damage production by accident.

### P2-1 — Outbox: leases are unnecessary; triggers are justified but should be staged

Purge is idempotent, so concurrent/duplicate worker execution is harmless; only completion marking after coalescing needs the generation guard. Dropping lease metadata simplifies the migration and worker (§3.6 lines 119, 128). On triggers: atomicity is genuinely needed because supabase-js cannot do multi-statement transactions (an API crash between commit and outbox insert would silently lose invalidation), so the trigger approach is defensible — but note every current writer routes through in-repo code (`src/app/api/v1/*` routes, `src/lib/sync-reviews.ts:165-176` shared by API and CLI, `scripts/*.mjs`), so a Phase 2a with an RPC-wrapped write+outbox or route-level publication calls covers 100% of real write paths, with table triggers as Phase 2b hardening against hand-run SQL. Also: the namespace-wide purge on any allowed-domain change (§3.6 line 125) triggers the stampede Vercel warns about; fine at this scale, but say so explicitly, or adopt the per-origin tags from P1-2 to make revocation surgical.

### P2-2 — Fix the business-mapping bug by eliminating the second mapping path, not patching it

Confirmed bug: `data.js` maps business server-side (`route.ts:96` → camelCase), then `src/lib/bootstrap.ts:68` re-runs `mapBusinessRow`, which reads snake_case (`widget-mappers.ts:100-101`) and produces `totalReviews: 0, averageRating: 0` on the first bootstrap paint — repaired only by the background refetch (which the plan then removes, making first paint permanently wrong unless fixed). §3.3 line 80 identifies this. Correction with teeth: have `data.js` emit the **raw** `businesses` join exactly like `/api/v1/widgets/[id]` does, and map once client-side, so there is one mapping path instead of two that can diverge again.

### P2-3 — Transition-window honesty and one regression gate

Browsers hold today's `max-age=60` data responses (`cache-headers.ts:6-7`); for ≤60 s after rollout the "next load" guarantee is violated for recently-visited browsers regardless of purge correctness. §3.7 line 146 acknowledges measuring this; the plan should also state it as an accepted, bounded transition exception (or a communicated go-live note). Additionally, add a worst-case regression gate: with data slow/absent, the async path must not render later than today's blocking path does — otherwise the change trades one user-visible failure mode for another.

### P2-4 — Form delivery settings are already public today; scope the fix deliberately

Confirmed: `data.js` emits the raw `form_widgets` row (`route.ts:104`) including `submit_webhook_url`/`submit_email` (`supabase/migrations/017_form_widgets.sql:72-73`), and `/api/v1/form-widgets/[id]` does the same. §3.3 line 81's field allowlist is a security improvement, not just performance hygiene. Verified that the client is server-authoritative for delivery (`FormWidget.tsx:146-147` posts to `/api/forms/<id>/submit`), so dropping those fields should be behavior-safe — but the plan should explicitly record whether these values are considered compromised-but-low-value (they're already world-readable) and confirm `formFromDbRow` doesn't read them before merging.

## 3. Unnecessary scope / missing decisions

- **Justified, keep:** outbox with generations (atomicity + coalesced completion), MutationObserver (GHL/page-builder insertions are real per `src/embed.tsx:128` comments), no-SWR-on-data stance, delete-over-invalidate.
- **Simplifiable:** lease metadata (P2-1); detached/reinserted-node and ID-change lifecycle handling (§3.2 line 65) could be Phase 1b behind a flag without blocking the core win.
- **Missing decisions:** the P0-1 fallback design; P1-2 hit-rate thresholds; purge-ack latency bound feeding the "published" acknowledgement; whether `widget-manifest.json` has external consumers (no in-repo consumer exists — only `middleware.ts:9` references it; inventory via access logs before retiring, as the plan says, but name the method).

## 4. Test / rollout gaps

- §5 item 3 must add mixed-bundle-version cases (P0-2) and old-format bootstrap (P1-1).
- §5 item 14 should assert the no-Vary success-response inconsistency is gone on *both* `data.js` and the JSON routes, and assert a 404 cannot be cached (Vercel caches 404s if headers allow).
- Rollback (§6.6) ordering is right and matches Vercel's deployment-scoped cache keys; add one explicit check: after rollback + purge, verify via the alias, not the deployment URL (cache keys differ per host).
- Item 21's env guard needs a defined mechanism (P1-3), not just "add a guard."
- The 30% paint-improvement target (item 18) is a fine measurement gate; it does not leave architecture undecided, so it's acceptable — unlike the P0-1 contingency.

## 5. What can safely be implemented first (no provider gates, no cache changes)

1. **Playwright env guard** (P1-3) — do this before anything else runs.
2. **Payload correctness**: single mapping path for business metrics (P2-2), one review array, form-field allowlist (P2-4), runtime payload validation, serialization hardening — all origin-side, zero cache-behavior change.
3. **Loader/runtime**: immediate scan, no `DOMContentLoaded` wait, per-widget state machine, readiness notification, legacy-marker write/read (P0-2), DCL backstop re-read (P1-1), and stop-refetch-on-valid-bootstrap in all four wrappers. Ships the "independent mounting" and "no redundant fetches" requirements under today's conservative headers.
4. **Routing/middleware**: `beforeFiles` rewrite for hashed URLs, `/widget.js` public-path fix (`middleware.ts:6-13` — currently auth-redirects anonymous requests, and `docs/SOP-widget-deployment.md:145` tells customers to use exactly that URL), manifest audit.
5. **Editor honest-save plumbing** against a stubbed publication-status field, so Phase 2 is a backend swap.

Items 1–4 deliver most of the user's five requirements without the outbox, triggers, worker, or any TTL increase — those remain correctly gated on the Phase 0 purge-propagation and fill-after-purge proofs, with the P0-1 fallback pre-decided so a failed gate is a switch, not a redesign.

## Focused second review

- Same CLI version, explicit `kimi-code/k3` model and read-only `plan` agent profile.
- Exit code 0; exactly two Read tool calls, limited to the plan and this review record.
- Reviewed plan SHA-256 before the final wording clarification: `6adb7c99f79c7877bd920f77265f07b08d7b0d5f4495525a67b41adf3a89966b`.
- Outcome: ready for planning approval, no remaining plan-level blockers.
- Final clarification applied afterward: §3.4 now explicitly says only the fallback's newly generated snippets use `resolve.js` instead of the §3.2 `data.js` bootstrap. Existing URLs and the shared renderer URL remain stable.

### Second review (verbatim)

## Verdict: Ready for planning approval

Both P0s and all P1s are addressed at the plan level, with no material new internal contradictions. The two highest-risk correction areas hold up under scrutiny.

**P0-1 (fallback now concrete, §3.4 items 1–6).** The revision-addressed fallback is fully specified: immutable snapshots, atomic generation-guarded pointer, tombstones, no-GC start, measured-cost admission. Critically, the two properties flagged for this review are preserved:

- *Synchronous legacy behavior*: item 4 keeps `/data.js` as an uncached full bootstrap that "must still assign the old global synchronously in that script execution," explicitly noting that silently swapping it for an async pointer would break deployed renderers. Old JSON fallback routes return the published snapshot with no mutable CDN cache. No contradiction with §3.1's stable-URL commitment.
- *Domain admission*: item 5 keeps per-visit admission on the resolver and adds a dedicated pre-CDN public-read middleware branch for direct revision requests, with the one-year CDN TTL explicitly conditioned on verifying Vercel middleware-before-cache ordering. The plan honestly prices this (admission work per payload request) rather than weakening revocation, and item 6 plus §3.4's closing paragraph define the exit if the fallback itself fails: ship the independently validated improvements, report long caching unfinished. No unnamed architecture remains.

One minor, non-blocking ambiguity: item 3 introduces `resolve.js` for new snippets under the fallback, while §3.2 describes new snippets as data.js-bootstrap + bundle. This is a conditional design fork (fallback-only), and item 4 makes the legacy/new split clear, but one sentence stating that fallback snippets replace the bootstrap script URL with `resolve.js` would remove the only reading friction.

**P0-2 (mixed renderer ownership, §3.2 + §5 item 3).** Safe in both orders: check `data-bbs-mounted` *and* existing shadow root before claiming; write the legacy marker synchronously before `attachShadow` so a later-running old bundle skips the node; treat foreign roots as external (never attach/unmount); failure clears only self-owned state. Verification item 3 mandates executing a preserved old bundle with the new bundle in both orders across stable and hashed URLs. This closes the `NotSupportedError`-aborts-the-mount-loop scenario exactly.

**P1s.** P1-1: load/error listeners plus global re-read before/after registration, DCL demoted to recovery-only — deliberately better than the suggested DCL backstop and verified in §5 item 2. P1-2: concrete 100-request/≥80%-HIT gate, per-origin tags correctly scoped as purge-granularity (not fragmentation) fixes, middleware explicitly *not* an automatic fallback, 404 caching test added. P1-3: guard is the first Phase 0 deliverable with exact allowlists, known-production denial, and a negative test. P2 dispositions (leases dropped, camelCase map-once/validate-only contract, 60-second transition exception, scoped form-field hardening) are internally consistent.

**External validation gates still outstanding** (correctly deferred, none plan-blocking):

1. Vercel immediate-delete propagation, in-flight fill-after-purge, `Vary` behavior, promotion/rollback cache identity, and admission-before-CDN middleware ordering — isolated preview proof required.
2. Isolated Supabase environment availability and worker schedule support.
3. Measured performance of primary *and* fallback transports against §5 item 18 targets.
4. Inventory of historic snippet variants, SRI/CSP assumptions, old browser-cache policies on hashed URLs, and external `widget-manifest.json` consumers.

No remaining plan-level blockers. The document is approved as a planning artifact; implementation, migration, and deployment remain unauthorized and separately gated.
