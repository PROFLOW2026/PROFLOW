# ProjectFlow Owner Rules (high priority)

These rules apply to all agents working in this repository.

## SQL / migration execution

- **Never execute Production or shared-database SQL or migrations without separate explicit Owner approval.**
- Preparing a migration (SQL file, Drizzle schema/meta/journal, static/journal checks) is allowed; **applying it is not**.
- General implementation, release, commit, push, or deploy approval **does not** include SQL approval.
- If SQL is required: **prepare → report → STOP** and wait for explicit Owner approval to run/apply.
- Never modify an already-applied migration; add the next additive migration only when required.

## Release / Vercel

**Temporary mandatory process — until the Owner explicitly decides to return to automatic deployments.**

- **A push to GitHub does NOT deploy.** Automatic Git deployments for `main` are **disabled on purpose** (`vercel.json` → `git.deploymentEnabled.main = false`) because the production build needs about 10 GB and the Vercel Hobby builder has 8 GB. Do not wait for, expect, or "verify" a Vercel build after a push.
- Production is deployed **only on explicit Owner approval**, **only** via the Linux/Docker build + `vercel deploy --prebuilt --prod` route (`scripts/deploy/linux-prebuilt.ps1`), as documented in `docs/deployment.md`. **Never run a Production build on Windows.** Do not re-invent the scripts.
- After such a deployment, verify READY, the active domain, and the changed behavior. No duplicate builds, no automatic retry loops.
- Full rule: `.cursor/rules/production-deployment.mdc`. Release gate: `docs/RELEASE-PREFLIGHT.md`.

## Local databases

- Use local disposable test databases only when clearly isolated from Production/shared business data.
- If uncertain which database a command targets, do not run it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
