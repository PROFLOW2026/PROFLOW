# ProjectFlow Owner Rules (high priority)

These rules apply to all agents working in this repository.

## SQL / migration execution

- **Never execute Production or shared-database SQL or migrations without separate explicit Owner approval.**
- Preparing a migration (SQL file, Drizzle schema/meta/journal, static/journal checks) is allowed; **applying it is not**.
- General implementation, release, commit, push, or deploy approval **does not** include SQL approval.
- If SQL is required: **prepare → report → STOP** and wait for explicit Owner approval to run/apply.
- Never modify an already-applied migration; add the next additive migration only when required.

## Release / Vercel

- After push, verify a real Vercel Production deployment exists for the exact commit SHA.
- **BUILDING** or **READY** is sufficient — do not wait for READY unless the Owner explicitly requested production smoke.

## Local databases

- Use local disposable test databases only when clearly isolated from Production/shared business data.
- If uncertain which database a command targets, do not run it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
