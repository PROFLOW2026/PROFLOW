# ProjectFlow Release Preflight — Mandatory

Permanent policy for every Cursor agent (MAIN / AUTO) working in this repository.

**Cursor rule (always apply):** `.cursor/rules/projectflow-release-preflight.mdc`

---

## 1. Development phase

During normal implementation and fixes, use **only targeted validation**.

Examples:

- touched component → targeted component/unit check
- touched query → targeted query/integration check
- touched lifecycle → targeted lifecycle test
- touched TypeScript boundary → typecheck if needed

**Do not** repeatedly run after every small correction:

- full build
- full E2E
- full audit
- all tests
- migration hardening
- full Hebrew/runtime suite

The Owner explicitly does **not** want hour-long validation cycles after every change.

---

## 2. Owner approval changes the mode

Only when the Owner explicitly says something equivalent to:

- “תדחוף”
- “תעלה”
- “שחרר”
- “commit/push”
- “deploy”
- “הכל תקין מבחינתי”

…and the intent is clearly to **release**:

→ switch to **RELEASE PREFLIGHT MODE**.

At that point, **before the first push**, run **one complete local preflight**.

This is **not** optional. It prevents GitHub CI from discovering failures one-by-one across repeated pushes.

---

## 3. First inspect the actual GitHub CI workflow

**Do not invent a test list from memory.**

Before running preflight:

1. Read `.github/workflows/ci.yml`
2. Read any workflow/scripts it calls (e.g. `package.json` scripts)

The local preflight must match the **current** CI gates as closely as possible.

If CI changes in the future, this document means: **follow the current workflow**.

### Current CI gates (as of release baseline)

**Job: `Typecheck · Lint · Test · Build`** (`.github/workflows/ci.yml` → `quality`)

| Step | Command |
|------|---------|
| Install | `npm ci` |
| Migration journal parity | `npm run db:check-journal` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm run test:unit` |
| UI tests | `npm run test:ui` |
| Integration tests | `npm run test:integration` |
| Migration hardening | `npm run test:migration` |
| Production build | `npm run build` (with CI env vars for Supabase public keys) |

**Job: `Playwright critical (local harness)`** (`.github/workflows/ci.yml` → `e2e`)

| Step | Command |
|------|---------|
| Install Playwright Chromium | `npx playwright install --with-deps chromium` |
| Critical E2E | `npm run playwright:ci` |

Re-read `ci.yml` before each release — the table above is a snapshot, not a substitute.

---

## 4. Preflight scope check first

Before tests, inspect `git status` and `git diff`.

Confirm:

- intended release files only
- no unrelated files
- no temporary diagnostics
- no test artifacts that should not ship
- no `.env`, credentials, API keys, or secrets
- no local-only debug code
- no accidental generated files unless the repository expects them

### Database migrations

- **Never** modify migrations already applied by the Owner
- Agent **never applies SQL**
- Unapplied migration must be explicitly reviewed with the Owner before the Owner runs it
- After the Owner applies a migration, treat it as **immutable**

---

## 5. Run ONE complete local CI-equivalent preflight

Run the same gates as GitHub CI, using the repository’s real scripts.

At minimum (where currently part of CI):

- Migration journal parity
- TypeScript / typecheck
- Lint
- Unit tests
- UI tests
- Integration tests
- Migration hardening / tests
- Production build
- Critical Playwright local-harness gate

**Do not** substitute weaker commands.

**Do not** skip a CI gate merely because targeted tests already passed during development.

---

## 6. Fix failures BEFORE pushing

If local preflight finds failures: **do not push**.

Fix all known failures locally.

**Bad pattern (forbidden for release):**

```
push → CI lint fail → push fix → CI locale fail → push fix → CI test fail → push again
```

**Required pattern:**

```
local preflight → collect failures → fix them → rerun affected gate(s)
→ ONE final complete preflight → only then push
```

Objective: GitHub CI should **confirm** the release, not **discover** basic release failures.

---

## 7. One final local green state

Before the first release push, require:

**LOCAL RELEASE PREFLIGHT = PASS**

Report locally (all **current** mandatory CI gates):

| Gate | Result |
|------|--------|
| Migration journal parity | |
| Typecheck | |
| Lint | |
| Unit tests | |
| UI tests | |
| Integration tests | |
| Migration hardening | |
| Production build | |
| Critical Playwright | |
| Release scope | |
| Secrets check | |
| Unexpected files | |

Only when all current mandatory CI gates are green: proceed.

---

## 8. Commit and push only after preflight PASS

Then:

1. Commit intended scope
2. Push to `origin/main`
3. Confirm local HEAD = `origin/main`
4. Monitor GitHub CI until **SUCCESS** (do not stop while pending)
5. Monitor Vercel Production until **READY** (do not stop while pending)
6. Require deployment commit == GitHub HEAD

---

## 9. If GitHub CI still fails

A CI failure can still happen when the CI environment differs from local.

If it does:

1. Inspect the exact failed job/log
2. Identify **all** visible failures from that run
3. Reproduce locally where possible
4. Fix them **together**
5. Run the relevant local gate(s)
6. If release code changed materially, run final local preflight again
7. Make **one** corrective push

Do **not** commit one tiny CI fix at a time without checking whether additional known failures remain.

---

## 10. Vercel

After GitHub CI is green:

- Require Vercel Production = **READY** / **SUCCESS**
- Confirm **deployment commit == GitHub HEAD**

### Infrastructure (proven for ProjectFlow)

| Setting | Value |
|---------|--------|
| Vercel function region | **`dub1`** (Dublin) |
| Supabase primary region | **`eu-west-1`** (Ireland) |

Cross-region mismatch (e.g. US East compute + EU database) was proven to dominate tab latency. **Do not** change Vercel away from `dub1` unless the Owner explicitly approves a new infrastructure decision.

**Do not** migrate Supabase region automatically.

**Do not** switch DB pooler / `DATABASE_URL` connection mode automatically.

Configuration: `vercel.json` → `"regions": ["dub1"]`.

---

## 11. Do not confuse preflight with constant testing

| Phase | Validation |
|-------|------------|
| Normal development | Targeted tests only |
| Final Owner-approved release | One comprehensive local CI-equivalent preflight |
| After push | GitHub CI + Vercel confirmation |

Fast iteration during development; one strong preflight before release; one clean push when possible.

---

## 12. SQL Owner rule

| Role | Responsibility |
|------|----------------|
| **Agent** | Prepares SQL; reviews/tests migration; **never applies SQL** |
| **Owner** | Reviews; applies approved SQL |

Once the Owner confirms a migration is applied: that migration becomes **immutable**.

---

## 13. Current database / release baseline

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

### Released HEAD (Aug 2026)

| Item | Value |
|------|--------|
| Commit | `31ea2e761676a9b3602a1dcfba191c2c4a50f583` |
| GitHub CI | SUCCESS — run [32570120664](https://github.com/PROFLOW2026/PROFLOW/actions/runs/32570120664) |
| Production URL | https://proflow-two-bice.vercel.app |

### Current release includes

- Billing Plan UX redesign
- Global retention
- Performance repair (query reductions, auth/org caching, tab streaming)
- Cached auth Set rehydration crash fix
- Dublin Vercel region alignment (`dub1`)

Temporary DB latency probe: **removed** (diagnostic only; not in product).

---

## 14. Required agent behavior

Every future agent must read and follow this document (and the Cursor rule).

If an Owner request **conflicts** with this rule: the Owner’s **current explicit instruction** wins.

**Never** use this document as an excuse to run broad validation during every development correction.

**Purpose:**

- **FAST** iteration during development
- **ONE STRONG** preflight before release
- **ONE CLEAN** push when possible
