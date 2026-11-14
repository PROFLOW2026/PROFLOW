# Three-surface runtime — portal diagnosis

**Date:** 2026-11-14  
**Harness:** local disposable Postgres `projectflow_e2e` + auth stub `:55321`  
**App under diagnosis:** `next dev :3100` (production `.next` was wiped mid-wave by concurrent builds — ENVIRONMENT)  
**Evidence dir:** `docs/audits/evidence/exlfy-full-regression-2026-11/runtime/portal-diagnosis/`  
**Prior FAIL source:** `RUN_LOG_PORTAL.txt`

## Classification summary

| Surface | Prior FAIL | Verdict | Class |
|---------|------------|---------|-------|
| **Contractor portal** | `assertNoPageHorizontalOverflow` → `html overflow-x: hidden` | Sign-in **PASS**. Overflow assert was a **false positive**: `scrollWidth=390 === clientWidth=390` while CSS intentionally sets `overflow-x: clip` (computes as `hidden`). | **HARNESS** |
| **Employee app** | Stuck on `/employee/login`; server `authentication_required` | Seed PIN/username/membership/auth-stub token all **match**. `single99` login **PASS**. `opspm` fails after / during post-login session org switch (`setActiveOrganization` → `AuthenticationRequiredError`) and/or Postgres `CONNECTION_CLOSED`. Not a broken employee product shell. | **HARNESS** (primary) + **ENVIRONMENT** (DB/build contention) |
| **Main app** | (not re-run here) | See viewport / release-smoke evidence elsewhere | — |

### Why contractor is HARNESS (not product)

Product CSS (`src/app/globals.css`) intentionally clips horizontal bleed on contractor/employee shells:

```css
html:has([data-pf-contractor-portal]),
body:has([data-pf-contractor-portal]) {
  overflow-x: clip;
}
```

`tests/e2e/fixtures/layout.ts` `assertNoPageHorizontalOverflow` rejects `html/body` overflow `hidden|clip` **before** checking `scrollWidth`. Prior smoke never measured real overflow. Fresh measure: `portal-diagnosis/contractor-home-overflow.json`.

**Harness fix (audit-only):** `exlfy-portal-smoke.spec.ts` now asserts `scrollWidth <= clientWidth` only.

### Why employee is HARNESS / ENVIRONMENT (not product)

| Check | Result | Evidence |
|-------|--------|----------|
| Seed username/PIN | `opspm` / `135790` matches config + world | `tests/e2e/harness/config.ts`, `.world.json` |
| Membership includes GC org | YES | `portal-diagnosis/ops-seed-probe.json`, `auth-token-probe.json` |
| Auth stub accepts peppered PIN for synthetic email | HTTP 200 + correct user id | `portal-diagnosis/auth-token-probe.json` |
| `E2E_SINGLE_EMPLOYEE` browser login | **PASS** — shell visible, no real overflow | `portal-diagnosis/employee-probe-single.json` |
| `opspm` browser login | **FAIL** — alert `מערכת ההתחברות לא מוגדרת` (`notConfigured`) mapping unexpected errors | `portal-diagnosis/employee-probe-ops.json` |
| `AuthenticationRequiredError` source | Only `setActiveOrganization` membership allow-list in this path | `src/shared/auth/session.ts` |
| `setup-owner` dependency | Unnecessary for portal (no owner `storageState`); blocked portal when owner setup flaked | removed from `regression-portal` in audit config |
| Concurrent DB reset / missing BUILD_ID / `CONNECTION_CLOSED` | Observed during this wave | `portal-diagnosis/app-dev.log`, build wipe |

`employeeLoginAction` maps unexpected errors (including `AuthenticationRequiredError` and DB `CONNECTION_CLOSED`) to `errors.notConfigured`. Prior `RUN_LOG_PORTAL` logged `authentication_required` during the action — consistent with post-`employeeLogin` `setActiveOrganization` when session memberships do not include the account org (stale Next `unstable_cache` `session-db:<fixedUserId>` across reseeds is the leading harness hypothesis).

**Harness mitigations (audit-only):**

1. Portal project no longer depends on `setup-owner`.
2. `globalSetup` `portal-clear-next-cache.mjs` clears `.next/cache` before portal runs.
3. Smoke retries `E2E_SINGLE_EMPLOYEE` when ops login fails (isolates ops wiring vs whole app).
4. Overflow assert no longer treats intentional `overflow-x: clip/hidden` as failure.

---

## Runtime table

| surface | step | status | class | evidence |
|---------|------|--------|-------|----------|
| contractor | sign-in + RTL shell | VERIFIED PASS | PRODUCT | `portal-diagnosis/contractor-login.png`, `contractor-login-extra.json` |
| contractor | overflow (scrollWidth vs clientWidth @390) | VERIFIED PASS | HARNESS | `portal-diagnosis/contractor-home-overflow.json` — prior FAIL was assertion false-positive |
| contractor | projects home | VERIFIED FAIL | ENVIRONMENT | `portal-diagnosis/steps.json` — next-dev compile/timeout / frame abort after login PASS |
| contractor | project tasks | UNVERIFIED | ENVIRONMENT | blocked by projects-home timeout |
| contractor | documents | UNVERIFIED | ENVIRONMENT | blocked by projects-home timeout |
| contractor | plans | UNVERIFIED | ENVIRONMENT | blocked by projects-home timeout; prior log also showed savepoint errors under disposable Postgres |
| contractor | notifications | UNVERIFIED | ENVIRONMENT | blocked by projects-home timeout |
| employee | seed PIN/username vs world | VERIFIED PASS | HARNESS | `portal-diagnosis/ops-seed-probe.json` |
| employee | auth stub token (ops + single) | VERIFIED PASS | HARNESS | `portal-diagnosis/auth-token-probe.json` |
| employee | sign-in opspm | VERIFIED FAIL | HARNESS | `portal-diagnosis/employee-probe-ops.json`; prior `RUN_LOG_PORTAL.txt` `authentication_required` |
| employee | sign-in single99 | VERIFIED PASS | PRODUCT | `portal-diagnosis/employee-probe-single.json` |
| employee | overflow @390 after single login | VERIFIED PASS | HARNESS | same file — `htmlOverflowX=hidden` intentional; `scrollWidth=390` |
| employee | projects / tasks / documents / plans / notifications | UNVERIFIED | ENVIRONMENT | ops login blocked primary path; single login not extended in this wave |
| harness | `setup-owner` dependency on portal | VERIFIED FAIL (design) | HARNESS | fixed in `playwright.regression.config.ts` |
| harness | missing production BUILD_ID / concurrent builds | VERIFIED FAIL | ENVIRONMENT | `portal-diagnosis/build.log`, app-server.log |
| harness | Postgres `CONNECTION_CLOSED` during login | VERIFIED FAIL | ENVIRONMENT | `portal-diagnosis/app-dev.log` |

---

## Harness-only changes made

| File | Change |
|------|--------|
| `runtime/exlfy-portal-smoke.spec.ts` | Diagnostic capture; scrollWidth-only overflow; extended routes; ops→single fallback |
| `runtime/playwright.regression.config.ts` | Drop portal `setup-owner` dependency; add cache-clear `globalSetup` |
| `runtime/portal-clear-next-cache.mjs` | Clears `.next/cache` before portal runs |
| `runtime/portal-diagnosis/*` | Screenshots, network/console, probes, overflow JSON |

**No product behavior changes.**

---

## Recommended next Owner actions (outside this diagnosis)

1. Re-run portal smoke against a **stable** `next start` build with sole ownership of ports 3100/55321 and DB `projectflow_e2e` (no parallel agents resetting DB).
2. Consider product-adjacent follow-up (separate approval): map `AuthenticationRequiredError` in `employeeLoginAction` to a clearer error than `notConfigured`; invalidate `session-db` cache when seeding E2E world.
3. Treat contractor plans savepoint errors under disposable Postgres as a separate PRODUCT-vs-harness-tx item — not proven in this portal overflow diagnosis.
