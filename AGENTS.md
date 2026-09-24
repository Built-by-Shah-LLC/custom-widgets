<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## BBS Jira delivery workflow

**Mandatory for every bug, task, feature, update, review, test, release, or
deployment request:** read and apply
[.agents/skills/bbs-jira-delivery/SKILL.md](.agents/skills/bbs-jira-delivery/SKILL.md)
before planning or editing. Read its
[repository profile](.agents/skills/bbs-jira-delivery/REPO-PROFILES.md) before
choosing verification, review, or release steps.

Use Jira project **BBS Software Support** (`DEV`) with the
`bbs-widgets-software` label. Preserve unrelated work and obtain explicit
approval before any push, merge, deployment, external mutation, or Jira cloud
change. This workflow supplements the Next.js rules above; when instructions
conflict, follow the stricter applicable requirement.
