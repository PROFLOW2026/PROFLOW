# ProjectFlow Owner Rules (high priority)

These rules apply to all agents working in this repository.

## SQL / migration execution

- **Never execute Production or shared-database SQL or migrations without separate explicit Owner approval.**
- Preparing a migration (SQL file, Drizzle schema/meta/journal, static/journal checks) is allowed; **applying it is not**.
- General implementation, release, commit, push, or deploy approval **does not** include SQL approval.
- If SQL is required: **prepare → report → STOP** and wait for explicit Owner approval to run/apply.
- Never modify an already-applied migration; add the next additive migration only when required.

## Validation policy (Owner decision, supersedes any earlier CI-before-push/deploy requirement)

- Use **targeted checks only**: `npx tsc --noEmit -p .`, `eslint` on touched files, focused unit tests of the touched logic.
- **Do not** run a full CI / CI-equivalent preflight, all unit tests, wide E2E, UI sweeps, audits or migration tests before a push or deploy, and do not loop on CI after a push — unless the Owner explicitly asks in the current message.
- The production build made by the Linux/Docker deploy script is the deployment artifact, not a CI check. `.github/workflows` is unchanged.
- Details: `docs/RELEASE-PREFLIGHT.md`, `.cursor/rules/projectflow-release-preflight.mdc`.

## Release / Vercel

**Temporary mandatory process — until the Owner explicitly decides to return to automatic deployments.**

- **A push to GitHub does NOT deploy.** Automatic Git deployments for `main` are **disabled on purpose** (`vercel.json` → `git.deploymentEnabled.main = false`) because the production build needs about 10 GB and the Vercel Hobby builder has 8 GB. Do not wait for, expect, or "verify" a Vercel build after a push.
- Production is deployed **only on explicit Owner approval**, **only** via the Linux/Docker build + `vercel deploy --prebuilt --prod` route (`scripts/deploy/linux-prebuilt.ps1`), as documented in `docs/deployment.md`. **Never run a Production build on Windows.** Do not re-invent the scripts.
- After such a deployment, verify READY, the active domain, and the changed behavior. No duplicate builds, no automatic retry loops.
- Full rule: `.cursor/rules/production-deployment.mdc`. Release gate: `docs/RELEASE-PREFLIGHT.md`.

## Three-surface parity (permanent, all EXLFY features)

Every new feature or improvement to an existing feature in the main app **must be evaluated for, and support, the employee app and the contractor app** whenever the feature is relevant to them and they hold matching permissions.

- Default is **parity of capabilities** between the main app, the employee app and the contractor app.
- Do **not** restrict an employee or contractor merely because of the app type (`employeeApp`, `external`). The same permission gives the same capability on every surface.
- A capability difference is allowed only on a **permission** basis or a **documented essential need** (e.g. a provider web login that employees/contractors do not have). Document every intentional limitation next to the feature (see `docs/product/infra-three-surface-parity-matrix.md`).
- Prefer **shared components, logic and server actions** over per-surface copies. Surface wrappers should only wire the surface-specific transport (routes, browse actions), never decide capabilities.
- Never fix a blanket restriction by opening unrestricted access: add or reuse a proper capability permission, keep RLS, org isolation and project/vendor scoping intact, grant nothing automatically.
- Check the impact on all three surfaces on every relevant change. Full rule: `.cursor/rules/three-surface-parity.mdc`.

## Local databases

- Use local disposable test databases only when clearly isolated from Production/shared business data.
- If uncertain which database a command targets, do not run it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
