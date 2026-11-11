# Custom Widgets

BuiltByShah's Next.js admin and public runtime for embeddable widgets used on
third-party sites such as GoHighLevel. The browser renderer is an IIFE bundle
served from a stable application route, while a widget-specific data script
supplies validated configuration and content.

## Project Structure

| Path | Purpose |
|------|---------|
| `src/app/page.tsx` | Authenticated widget-management home |
| `src/app/api/embeds/widget.js/route.ts` | Stable public route for the renderer bundle |
| `src/app/api/embeds/widget/[id]/data.js/route.ts` | Widget-specific bootstrap data script |
| `src/embed.tsx` | Browser entry point for mounting widgets in Shadow DOM |
| `src/widget-registry.ts` | Compatibility registry for legacy one-script embeds |
| `src/components/` | Admin editors and widget renderers |
| `src/styles/widget.css` | Widget styles, injected into each widget's Shadow DOM |
| `scripts/build-widget.mjs` | Bundles `src/embed.tsx` to `public/widget.js` with esbuild |
| `supabase/migrations/` | Database schema and security migrations |

## Commands

```bash
npm install     # install dependencies
npm run dev     # start Next.js dev server + watch widget bundle
npm run build   # build widget bundle, then build Next.js app
npm run lint    # lint check
npm test        # unit tests followed by isolated local Playwright tests
```

## Deployment

Vercel runs `npm run build`. The application serves both scripts from stable
URLs, so existing snippets do not depend on deployment-specific asset hashes.

Add both scripts to the client site:

```html
<!-- BuiltByShah Widget Embed -->
<div data-bbs-embed="004a7b18-6bcc-4b2a-a8f9-454012312690"></div>
<script async src="https://widgets.example.com/api/embeds/widget/004a7b18-6bcc-4b2a-a8f9-454012312690/data.js"></script>
<script async src="https://widgets.example.com/api/embeds/widget.js"></script>
<!-- End BuiltByShah Widget Embed -->
```

## Adding New Widgets

Creating another record of an existing widget type does not require a registry
entry or a code deployment; the bootstrap payload selects the renderer.

Adding a new widget type requires:

1. Add its renderer and editor under `src/components/`.
2. Add its public payload handling to the bootstrap route and runtime types.
3. Add any compatibility behavior required for legacy one-script embeds.
4. Add unit and loader E2E coverage, then run `npm run build`.

The Form Widget files currently represent unreleased scaffolding and should not
be treated as a completed production feature.

## BBS Jira delivery workflow

For every bug, task, update, feature, review, test, release, or deployment
request, agents must first read and apply the local
[BBS Jira Delivery skill](.agents/skills/bbs-jira-delivery/SKILL.md), then the
[Widgets verification profile](.agents/skills/bbs-jira-delivery/REPO-PROFILES.md).
It keeps Jira work in **BBS Software Support** (`DEV`), using the
`bbs-widgets-software` label, and requires a scoped plan, review evidence,
appropriate tests, and explicit approval before a push or deployment.

## Important Notes

- The loader recognizes `data-bbs-embed` (current), `data-custom-widget`
  (generic), and `data-designdetail-embed` (legacy, kept so embed codes pasted
  before the rebrand keep working).
- Widget styles are bundled into the renderer, so no separate CSS file is needed.
- Each widget renders inside a Shadow DOM to keep styles isolated from the host
  GHL page.
- The renderer is built as an IIFE so it runs from a plain `<script>` tag.
- New snippets use bootstrap data; the hard-coded registry remains only for
  compatible loading of older snippets.
