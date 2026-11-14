# Eran Oct 2026 accrual repair — dry-run validation (2026-11-14)

**Verdict:** **STATIC VALIDATION PASS**. **Live dry-run execution: BLOCKED** (script requires DB reads; workspace `.env.local` resolves to **Supabase shared / Production**, not an isolated local DB).

| Item | Result |
|------|--------|
| Script default mode | DRY-RUN (no writes without `OWNER_APPROVED=1` **and** `EXECUTE=1`) |
| Guard logic (static) | PASS |
| Offline / mock plan | **Not supported** — always opens DB via `withOrgContext` |
| Executed dry-run | **BLOCKED** — would hit Production read |
| `EXECUTE=1` repair on Prod | **BLOCKED** |

Doc: `docs/audits/evidence/exlfy-full-regression-2026-11/bug-01/ERAN_OCT_2026_REPAIR.md`  
Script: `scripts/dry-run-eran-oct-2026-accrual-repair.ts`

---

## Script behavior (static review)

1. Loads `.env.local` with `override: true`.
2. Sets `process.env.DATABASE_URL` from `DIRECT_DATABASE_URL ?? DATABASE_URL` (no local-only guard).
3. Hard-coded scope: org `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec`, employee `1651af31-5f63-425d-a518-a9fa84931ecd`, month `2026-10`.
4. **Mode line:** `MODE: EXECUTE` only when **both** `EXECUTE=1` and `OWNER_APPROVED=1`; else `DRY-RUN`.
5. **Execute refusal:** `EXECUTE=1` without `OWNER_APPROVED=1` → exit 1.
6. **Dry-run path:** After printing `BEFORE` EMC/payroll and `PLAN`, returns **before** any `recomputeMonthlyEmployeeCostForOpenMonth` import/call (lines 144–146).
7. **Safety aborts (even in dry-run, on read):** no applied EMC; `known_quality=actual`; payroll already `paidAt`.

Writes occur **only** inside `if (execute && ownerApproved)` block.

---

## Why live dry-run was not executed

| Signal | Observation |
|--------|-------------|
| `.env.local` `DATABASE_URL` / `DIRECT_DATABASE_URL` | Host `aws-1-eu-west-1.pooler.supabase.com`, project ref `rnjeggpsjchayprygkcw` — **shared Supabase, not local** |
| `TEST_DATABASE_URL` | Empty |
| Script | No allowlist for `127.0.0.1` / `projectflow_e2e`; no offline mode |
| Eran EMC rows | Exist on Production tenant only (per repair doc), not on disposable `projectflow_e2e` without bespoke seed |

**Policy:** Dry-run still performs **SELECT** on `employee_month_costs` / `employee_payroll_payments` and resolves an org owner via admin SQL. Connecting with current env = **Production read** → **not executed** in this audit.

**Commands run:** none against any database for this script.

---

## Data mutation risk (when Owner later approves execute)

| Mode | DATA MUTATION |
|------|----------------|
| Default dry-run | **NO** (read + stdout plan only) |
| `OWNER_APPROVED=1` + `EXECUTE=1` | **YES** — supersede recompute, unpaid payroll expected sync, general cost month side path (per script PLAN) |

**SCHEMA MUTATION:** NO.

**RISK:** MEDIUM (financial rows; immutability guard on in-place applied EMC amounts respected by design).

---

## Optional local exercise (not run)

To exercise stdout on disposable data without Prod:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
$env:DIRECT_DATABASE_URL=''
npx tsx scripts/dry-run-eran-oct-2026-accrual-repair.ts
```

Expected: fail fast (`No applied EMC for target month` or `No active owner for org`) unless Eran-shaped seed is loaded. **Not required for this audit.**

---

## Stop for Owner

**Production dry-run read:**

```
ERAN OCT 2026 REPAIR DRY-RUN (Production read) = BLOCKED in agent audit.
Owner may explicitly authorize read-only dry-run against Supabase after reviewing ERAN_OCT_2026_REPAIR.md.
```

**Production execute:**

```
DATA MUTATION = YES (only when OWNER_APPROVED=1 AND EXECUTE=1)
APPLY / EXECUTE on Production = BLOCKED until Owner explicitly says to run/apply this repair against Production.
Never set EXECUTE=1 without separate OWNER_APPROVED=1 and explicit repair approval.
```

**Recommendation before execute:** Run `OWNER_APPROVED=1 EXECUTE=1` on **isolated** DB with Eran seed first; then separate approval for Production.

---

## Guard checklist

| Guard | Present |
|-------|---------|
| Default no writes | Yes |
| `EXECUTE` requires `OWNER_APPROVED` | Yes |
| Refuses `known_quality=actual` | Yes |
| Refuses paid payroll | Yes |
| Uses supersede recompute, not in-place EMC UPDATE | Yes (execute path only) |
| Local-only URL enforcement | **No** — **gap**; rely on env discipline |