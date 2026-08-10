# Pre-0021 — Reviewer 1: Financial + Concurrency

**Reviewer:** 1 — Financial / Concurrency  
**Date:** 2026-08-10  
**Binding:** `docs/product/_PRE0021-LEAD-CONTRACT.md`  
**Scope:** Folded unapplied `drizzle/migrations/0021_workforce_contacts_and_allocations.sql` + Agent 1/2 docs + `tests/integration/pre0021/*`  
**Forbidden observed:** no commit / push / `db:migrate` / owner Supabase apply; no edits to 0000–0020; **no edit to 0021** (report + snippets only)

```text
STATUS = PASS (SQL integrity) / HOLD FEATURE GATES
### Lead fixes (2026-08-10)

| ID | Status |
|----|--------|
| HIGH#1 applied→closed | Closed in 0021 immutability guard |
| HIGH#2 closed+supersede | Closed — refuse run supersede while month closed |
| HIGH#3 orphan applied | Closed — `employee_month_costs_applied_requires_run` |
| HIGH#4 monthly rollup | **HOLD** — gates stay false until Displacement wired in aggregation |
| HIGH#5 vendor status | Closed — loader filters `status = 'applied'` |
```

---

## 1. Executive verdict

Lead fold of Agent 1 A–I guards into 0021 is **real and effective** on disposable DB: month immutability, currency chain, labor conservation (header + lines), vendor NET cap (payment ignored), vendor/assignment concurrency locks, displacement coupling CHECK + apply flip, assignment overlap, contact UPDATE guard, and composite org FKs all resisted break attempts.

Residual risk is **not** a silent over-allocation race in SQL. It is (a) incomplete month `closed` lifecycle, (b) orphan `applied` months without a run, and (c) app rollup gaps that would corrupt Actual **if** feature gates flip before wiring.

---

## 2. Attack matrix (attempted breaks)

| # | Attack | Result | Evidence |
|---|--------|--------|----------|
| 1 | Employee month economic UPDATE/DELETE after applied/closed | **HELD** | Adversarial + Agent1 A |
| 2 | Currency mismatch month/run/lines; vendor≠bill | **HELD** | Adversarial + Agent1 C |
| 3 | Labor over-allocation / conservation bypass | **HELD** | Header≠known and lines≠allocated both fail |
| 4 | Vendor SUM(active) > bill NET; payment inflate ceiling | **HELD** | Overhead + payment probes |
| 5 | Concurrent vendor allocations (two connections) | **HELD** | Final active SUM ≤ NET |
| 6 | Concurrent assignment overlap (two connections) | **HELD** | Final non-cancelled count = 1 |
| 7 | Labor double-count via Displacement | **HELD in SQL** | `applied`+`time_snapshot` rejected; apply flips `monthly_allocated`; reverse flip blocked |
| 8 | Retroactive rewrite of applied runs/lines/vendor | **HELD** | Immutability triggers |
| 9 | Tenant mismatch (cross-org FKs) | **HELD** | Composite `(id, organization_id)` FKs |

**Displacement note (app):** `src/modules/financials` still has **no** monthly-allocation Actual path. SQL displacement alone does not change Mode C time rollups until release wiring. Gates `EMPLOYEE_MONTH_COSTS_READY` / `AP_BILL_PROJECT_ALLOCATIONS_READY` are correctly **false**.

---

## 3. Findings

### BLOCKER

_None for current Pre-0021 SQL apply while feature READY flags remain false._

(Prior Master-Wave SQL BLOCKERs A–G/I were folded; disposable tests confirm presence and behavior.)

### HIGH

1. **`applied → closed` is unreachable**  
   Immutability only allows `applied|closed → superseded`. Normal “lock the month” after apply fails with `employee_month_costs_applied_transition`. `closed` is only creatable by INSERT (or future Lead fix).  
   **Lead snippet:**

```sql
-- In app.employee_month_costs_immutability_guard(), replace the transition arm:
    ELSIF NOT (
      (OLD.status = 'applied' AND NEW.status IN ('closed', 'superseded'))
      OR (OLD.status = 'closed' AND NEW.status = 'superseded')
    ) THEN
      RAISE EXCEPTION 'employee_month_costs_applied_transition'
        USING ERRCODE = '23514';
    END IF;
-- Optionally: require NEW.locked_at IS NOT NULL when NEW.status = 'closed'.
```

2. **Latent closed-month + run-supersede coupling**  
   `labor_allocation_runs_displacement_apply` on run `applied→superseded` sets `recognition_source = 'time_snapshot'` while keeping `status = 'closed'` when the month was closed — that would violate `employee_month_costs_displacement_coupling`. Today the path is unreachable because (1) blocks close; once (1) is fixed, supersede-on-closed becomes a **BLOCKER** unless updated.  
   **Lead snippet (pick one):**

```sql
-- Option A: refuse run supersede while month is closed (force month supersede first)
IF NEW.status = 'superseded' AND OLD.status = 'applied' THEN
  IF EXISTS (
    SELECT 1 FROM public.employee_month_costs m
    WHERE m.id = NEW.employee_month_cost_id
      AND m.organization_id = NEW.organization_id
      AND m.status = 'closed'
  ) THEN
    RAISE EXCEPTION 'labor_allocation_runs_month_closed'
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.employee_month_costs
  SET recognition_source = 'time_snapshot',
      status = 'draft',
      updated_at = now()
  WHERE id = NEW.employee_month_cost_id
    AND organization_id = NEW.organization_id
    AND recognition_source = 'monthly_allocated';
END IF;
```

3. **Orphan `applied`/`monthly_allocated` month without an applied run**  
   SQL CHECK allows INSERT of `status='applied'` + `recognition_source='monthly_allocated'` with **zero** labor runs. Once app respects displacement, that understates labor Actual (time displaced, lines empty) rather than double-counts — still integrity failure.  
   **Lead intent:** BEFORE INSERT/UPDATE trigger requiring an applied run (or allow only via displacement trigger depth).

4. **Release wiring — monthly Displacement not in financial aggregation**  
   `LABOR-COST-INTEGRITY.md` §5 documents the rule; `aggregateProjectCosts` / time loaders do not branch on `monthly_allocated`. Flipping `EMPLOYEE_MONTH_COSTS_READY` before wiring = **double-count Mode C + monthly lines**.

5. **Release wiring — vendor allocation loader ignores `status`**  
   `loadRecognizedVendorBillsForProject` loads **all** `ap_bill_project_allocations` rows (draft/applied/superseded). Draft/superseded mark `billIdsWithAllocations` and can suppress header while counting draft amounts → premature/wrong Actual when `AP_BILL_PROJECT_ALLOCATIONS_READY=true`.  
   **App fix (not 0021):** filter `status = 'applied'` for line amounts; treat “has allocations” as **exists applied** (or exists draft|applied only for disclosure — Actual must use applied only).

### MEDIUM

1. Conservation still re-reads live `employee_month_costs.known_amount` (no `source_amount` snapshot on the run). Month immutability after apply closes the practical hole; snapshot remains a nicety for audit clarity.  
2. PGlite socket contention may `ECONNRESET` the loser instead of `23514`; safety asserted on final sums. Prefer throwaway real Postgres in owner CI for crisp codes.  
3. `btree_gist` exclusion is best-effort on PGlite; advisory lock is the portable guarantee (acceptable).  
4. Vendor visible unallocated is derived (no persisted remainder column) — OK if org disclosure ships with gate flip (Agent 4 territory).

---

## 4. What was confirmed present in folded 0021

| Guard | Object |
|-------|--------|
| Month immutability + `adjusts_month_id` | `employee_month_costs_immutability_guard` |
| Calendar `year_month` + quality coherence | CHECKs |
| Displacement coupling + apply flip | CHECK + `labor_allocation_runs_displacement_apply` |
| Conservation header + Σ lines | `labor_allocation_runs_conservation_guard` |
| Labor/run/line currency | `labor_allocation_currency_guard` |
| Labor line percent/hours/days | CHECKs |
| One active run / one project line | partial uniques |
| Applied run/line immutability | triggers |
| Vendor status lifecycle + NET cap + FOR UPDATE + advisory | `ap_bill_project_allocations_guard` |
| Assignment advisory (+ optional gist excl.) | `employee_project_assignments_no_overlap` |
| Contact UPDATE pointer | `client_contacts_project_pointer_guard` |
| Composite org FKs on new tables | present |
| Permission-aware RLS + cost keys (Agent 2) | present (not re-audited as Auth reviewer) |

No clear BLOCKER SQL typo found in the folded bodies. Prefer Lead-applied snippets above over Reviewer editing 0021.

---

## 5. Tests run

```text
npx vitest run \
  tests/integration/pre0021/agent1-financial-integrity.test.ts \
  tests/integration/pre0021/reviewer1-adversarial.test.ts \
  tests/integration/pre0021/reviewer1-lifecycle-probes.test.ts
```

| Suite | Result |
|-------|--------|
| Agent1 financial integrity (patched + 0021 presence + concurrency) | **10/10 passed** |
| Reviewer1 adversarial (attacks 1–9 + concurrency re-break) | **10/10 passed** |
| Reviewer1 lifecycle probes (close transition, orphan applied, vendor status semantics) | **3/3 passed** |
| **Total** | **23/23 passed** |

Disposable harness only (PGlite / pglite-socket). No owner DB.

**New test files (reviewer):**

- `tests/integration/pre0021/reviewer1-adversarial.test.ts`
- `tests/integration/pre0021/reviewer1-lifecycle-probes.test.ts`

---

## 6. Delivery block

```text
STATUS = PASS (SQL integrity) / HOLD FEATURE GATES
Proposal / files
  - docs/product/_PRE0021-REVIEWER1-FINANCIAL.md
  - tests/integration/pre0021/reviewer1-adversarial.test.ts
  - tests/integration/pre0021/reviewer1-lifecycle-probes.test.ts
Schema asks for Lead (exact SQL intent)
  - HIGH#1 allow applied→closed (snippet §3)
  - HIGH#2 fix displacement on closed before enabling close (snippet §3)
  - HIGH#3 reject orphan applied months without applied run
Tests run
  - 23 disposable Pre-0021 tests — all passed
BLOCKER / HIGH / MEDIUM
  - BLOCKER: none (while READY flags false)
  - HIGH: 5 (close lifecycle, latent closed supersede, orphan applied, monthly app wiring, vendor status filter)
  - MEDIUM: 4 (source_amount, PGlite contention codes, gist best-effort, vendor remainder disclosure)
```

**NO COMMIT. NO PUSH. NO `db:migrate`.**
