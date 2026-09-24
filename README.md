# Custom Widgets (Next.js)

Self-hosted embeddable widgets (BuiltByShah) served to third-party sites such as
GoHighLevel (GHL). The embed script is built as a single IIFE bundle that
third-party sites load with a plain `<script src>` tag.

## Project Structure

| Path | Purpose |
|------|---------|
| `src/embed.tsx` | Entry point for the embed script loaded by third-party sites |
| `src/widget-registry.ts` | Maps widget IDs to React components |
| `src/components/` | Widget components (reviews badge, carousel, before/after) |
| `src/styles/widget.css` | Widget styles, injected into each widget's Shadow DOM |
| `scripts/build-widget.mjs` | Bundles `src/embed.tsx` to `public/widget.js` using esbuild |
| `src/app/page.tsx` | Dev preview page with a sample embed placeholder |

## Commands

```bash
npm install     # install dependencies
npm run dev     # start Next.js dev server + watch widget bundle
npm run build   # build widget bundle, then build Next.js app
npm run lint    # lint check
```

## Deployment

Run `npm run build`, then upload `public/widget.js` to your CDN or static host.
Add the embed code to GHL sites:

```html
<!-- BuiltByShah Widget Embed -->
<div data-bbs-embed="004a7b18-6bcc-4b2a-a8f9-454012312690"></div>
<script src="https://your-cdn.com/widget.js" defer></script>
<!-- End BuiltByShah Widget Embed -->
```

## Adding New Widgets

1. Create a component in `src/widgets/`.
2. Import and register it in `src/widget-registry.ts` with its widget ID.
3. Run `npm run build` and redeploy `public/widget.js`.

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
- Widget styles are bundled into `widget.js`, so no separate CSS file is needed.
- Each widget renders inside a Shadow DOM to keep styles isolated from the host
  GHL page.
- The embed script is built as an IIFE so it runs immediately with a plain
  `<script src>` tag.
