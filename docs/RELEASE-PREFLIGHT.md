# ProjectFlow Release Policy — Mandatory

Permanent policy for every Cursor agent (MAIN / AUTO) working in this repository.

**Cursor rule (always apply):** `.cursor/rules/projectflow-release-preflight.mdc`

> **Policy change (Owner decision, Nov 2026).** The previous requirement to run a complete CI-equivalent
> preflight before every push or deploy is **cancelled**. Targeted checks only, unless the Owner explicitly
> asks for broader validation in the current message. The GitHub Actions workflow itself was **not** changed.

---

## 1. Validation policy (development and release alike)

Use **only targeted, necessary checks** that match the change:

- `npx tsc --noEmit -p .` (typecheck)
- `eslint` on the touched files
- focused unit tests of the touched logic (for example alignment, permissions, money, i18n of the touched area)
- a focused local harness/smoke only when the change cannot be verified otherwise

**Do not** run, before a push or a deploy, unless the Owner explicitly asks for it:

- full CI / CI-equivalent preflight
- all unit tests, full UI, full integration
- wide E2E / Playwright regression sweeps and UI sweeps
- audits
- migration hardening tests
- CI retries or "push until green" loops after a push

The Owner explicitly does **not** want hour-long validation cycles.

---

## 2. Release steps (when the Owner approves a release)

Approval wording such as “תדחוף”, “שחרר”, “deploy”, “commit/push”, “הכל תקין מבחינתי”:

1. Run the targeted checks of section 1 for what changed.
2. **Scope check** — inspect `git status` / `git diff`: intended files only, no `.env`/keys/credentials, no
   temporary diagnostics, no accidental artifacts.
3. Commit the intended scope and push to `origin/main`.
4. A push does **not** deploy (automatic Git deployments for `main` are disabled). Production is deployed
   only on Owner approval via the Linux/Docker prebuilt route — see [deployment.md](./deployment.md).
5. After a prebuilt deployment: verify READY, the domain aliased, and the changed behavior; the deployed code
   must be the commit that was `HEAD` when the script ran.

The production build that the Linux/Docker script creates is **not** a "CI check" — it is the deployment
artifact and is allowed. It runs only through that existing route, **never on Windows**.

No additional CI is run after a deploy.

---

## 3. GitHub Actions

`.github/workflows/ci.yml` keeps running on push as before. Agents do not wait for it, retry because of it, or
replicate its gates locally as a precondition. If the Owner asks to look at a failed run, inspect the logs and
fix what is actually reported.

---

## 4. Database migrations and SQL (unchanged, non-negotiable)

- **Never** modify migrations already applied by the Owner.
- Agent **never executes SQL / migrations** against Production or any shared database without a **separate,
  explicit** Owner approval given after the SQL file was prepared and reviewed.
- Release, push, deploy or “finish everything” approval is **not** SQL approval.
- After the Owner applies a migration, treat it as **immutable**.

---

## 5. Vercel

**Temporary process (see [deployment.md](./deployment.md)):** automatic Git deployments for `main` are disabled
on purpose (`vercel.json` `git.deploymentEnabled`). Do not expect or wait for a Vercel build after a push.
After an Owner-approved Linux/Docker prebuilt deployment:

- Require Vercel Production = **READY**, the domain aliased, and the change verified
- Confirm the deployed code is the commit that was `HEAD` when the deploy script ran

### Infrastructure (proven for ProjectFlow)

| Setting | Value |
|---------|--------|
| Vercel function region | **`dub1`** (Dublin) |
| Supabase primary region | **`eu-west-1`** (Ireland) |

Cross-region mismatch (e.g. US East compute + EU database) was proven to dominate tab latency. **Do not**
change Vercel away from `dub1` unless the Owner explicitly approves a new infrastructure decision.

**Do not** migrate Supabase region automatically.

**Do not** switch DB pooler / `DATABASE_URL` connection mode automatically.

Configuration: `vercel.json` → `"regions": ["dub1"]`.

---

## 6. Current database / release baseline

Documented for future agents (update this section after major releases).

### Database

| Item | Status |
|------|--------|
| Migrations **0000–0066** | **APPLIED + IMMUTABLE** |
| `0066_workforce_time_integrity.sql` | **APPLIED** (workforce time integrity: daily framework, excess approval, idempotency) |
| `0066_billing_plan_line_target_date_idx.sql` | **REMOVED — NEVER APPLIED** (obsolete performance-index draft; not the applied 0066) |
| **Next migration number** | **0067+** |

Do **not** modify applied migrations 0000–0066.

### Infrastructure

| Item | Value |
|------|--------|
| Vercel Production region | `dub1` |
| Supabase primary region | `eu-west-1` |
| Pooler changed | NO |

### Earlier released HEAD (Aug 2026)

| Item | Value |
|------|--------|
| Commit | `31ea2e761676a9b3602a1dcfba191c2c4a50f583` |
| Production URL | https://proflow-two-bice.vercel.app |

---

## 7. Required agent behavior

Every future agent must read and follow this document (and the Cursor rule).

If an Owner request **conflicts** with this rule: the Owner’s **current explicit instruction** wins, except
that it never grants SQL execution implicitly.

**Purpose:** fast iteration, targeted checks, one clean push, a deploy only on Owner approval.
