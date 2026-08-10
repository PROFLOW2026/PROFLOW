# PRE-0021 Agent 1 — Financial / Data Integrity Hardening

**Agent:** 1 — Integrity  
**Status:** COMPLETE (proposal + disposable tests; **did not** edit `0021_*.sql`)  
**Binding:** `docs/product/_PRE0021-LEAD-CONTRACT.md`  
**Date:** 2026-08-10  

**Forbidden (honored):** edit `drizzle/migrations/0021_*.sql`; create 0022; commit/push; `db:migrate` / apply against owner Supabase; modify 0000–0020.

### Lead integration (2026-08-10)

Folded into unapplied `0021_workforce_contacts_and_allocations.sql` + Drizzle mirrors:

- A–I guards (month immutability + `source`, calendar month, currency chain, labor ranges, vendor lifecycle/NET/concurrency, assignment advisory+exclusion, contact UPDATE)
- Also kept Agent 2 RLS section after integrity

`tests/integration/pre0021/agent1-integrity-patch.sql` remains as disposable idempotent overlay for tests.

---

## STATUS

```
STATUS = COMPLETE
Proposal / files
  - docs/product/_PRE0021-AGENT1-INTEGRITY.md
  - tests/integration/pre0021/agent1-integrity-patch.sql
  - tests/integration/pre0021/agent1-financial-integrity.test.ts
  - tests/integration/pre0021/two-connection.ts
Schema asks for Lead (exact SQL intent)
  - Fold agent1-integrity-patch.sql into 0021 (sections A–I below)
  - Sync Drizzle schema mirrors (status/adjusts_month_id/checks/triggers)
Tests run
  - vitest tests/integration/pre0021/agent1-financial-integrity.test.ts
BLOCKER / HIGH / MEDIUM
  - see §Findings
```

---

## Audit of current 0021 (before patch)

| ID | Requirement | Current 0021 | Verdict |
|----|-------------|--------------|---------|
| A | Month economic immutability after applied/closed; draft editable; corrections via supersede/adjust | Displacement + run immutability exist; **no** month money immutability; **no** `adjusts_month_id` | **BLOCKER** |
| B | `year_month` real YYYY-MM 01–12; quality↔amount coherent | Shape allows `00`/`13`; no quality/amount coherence | **BLOCKER** |
| C | Currency month=run=lines; vendor alloc=bill | No currency chain guards | **BLOCKER** |
| D | Line percent 0–100, hours≥0, days≥0, amount>0; conservation | amount>0 + apply conservation exist; percent/hours/days **missing** | **HIGH** |
| E | `SUM(active alloc) ≤` recognized bill NET (not payment) | No cap trigger | **BLOCKER** |
| F | Vendor concurrency transaction-safe + real two-connection race | No `FOR UPDATE` / advisory lock | **BLOCKER** |
| G | Vendor draft→applied→superseded history | **No `status` column** | **BLOCKER** |
| H | Assignment overlap concurrency-safe (exclusion preferred) | Trigger only (TOCTOU); no advisory lock; no exclusion | **HIGH** |
| I | Contact UPDATE cannot leave invalid project pointer | Project-side guard only; contact UPDATE unguarded | **BLOCKER** |

---

## Schema asks — exact SQL (Lead)

Lead should paste/adapt the following into `0021_workforce_contacts_and_allocations.sql` (after the related base tables/triggers). Full file: `tests/integration/pre0021/agent1-integrity-patch.sql`.

### A — `employee_month_costs` immutability + adjust pointer

```sql
ALTER TABLE "employee_month_costs"
  ADD COLUMN IF NOT EXISTS "adjusts_month_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_month_costs_adjusts_month_fk'
  ) THEN
    ALTER TABLE "employee_month_costs"
      ADD CONSTRAINT "employee_month_costs_adjusts_month_fk"
      FOREIGN KEY ("adjusts_month_id")
      REFERENCES "employee_month_costs" ("id")
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.employee_month_costs_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('applied', 'closed') AND pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'employee_month_costs_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('applied', 'closed') THEN
    IF NEW.status = OLD.status THEN
      IF NEW.known_amount IS DISTINCT FROM OLD.known_amount
        OR NEW.estimated_amount IS DISTINCT FROM OLD.estimated_amount
        OR NEW.actual_amount IS DISTINCT FROM OLD.actual_amount
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.year_month IS DISTINCT FROM OLD.year_month
        OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.known_quality IS DISTINCT FROM OLD.known_quality
        OR NEW.recognition_source IS DISTINCT FROM OLD.recognition_source
        OR NEW.adjusts_month_id IS DISTINCT FROM OLD.adjusts_month_id
      THEN
        RAISE EXCEPTION 'employee_month_costs_immutable'
          USING ERRCODE = '23514';
      END IF;
    ELSIF NOT (
      (OLD.status = 'applied' AND NEW.status = 'superseded')
      OR (OLD.status = 'closed' AND NEW.status = 'superseded')
    ) THEN
      RAISE EXCEPTION 'employee_month_costs_applied_transition'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'employee_month_costs_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_month_costs_immutability_guard ON public.employee_month_costs;
CREATE TRIGGER employee_month_costs_immutability_guard
  BEFORE UPDATE OR DELETE ON public.employee_month_costs
  FOR EACH ROW
  EXECUTE FUNCTION app.employee_month_costs_immutability_guard();
```

**Intent:** Draft editable. Applied/closed economic fields frozen. Corrections = `status → superseded` + new active row with `adjusts_month_id`. Displacement trigger still allowed via `pg_trigger_depth() > 1`.

### B — Calendar `year_month` + quality coherence

```sql
ALTER TABLE "employee_month_costs"
  DROP CONSTRAINT IF EXISTS "employee_month_costs_year_month_shape";
ALTER TABLE "employee_month_costs"
  ADD CONSTRAINT "employee_month_costs_year_month_shape"
  CHECK ("year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "employee_month_costs"
  DROP CONSTRAINT IF EXISTS "employee_month_costs_quality_amount_coherent";
ALTER TABLE "employee_month_costs"
  ADD CONSTRAINT "employee_month_costs_quality_amount_coherent"
  CHECK (
    (
      "known_quality" = 'estimated'
      AND ("estimated_amount" IS NULL OR "estimated_amount" = "known_amount")
    )
    OR (
      "known_quality" = 'actual'
      AND "actual_amount" IS NOT NULL
      AND "actual_amount" = "known_amount"
    )
  );
```

### C — Currency chain

```sql
CREATE OR REPLACE FUNCTION app.labor_allocation_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  month_currency char(3);
  run_currency char(3);
BEGIN
  IF TG_TABLE_NAME = 'labor_allocation_runs' THEN
    SELECT m.currency INTO month_currency
    FROM public.employee_month_costs m
    WHERE m.id = NEW.employee_month_cost_id
      AND m.organization_id = NEW.organization_id;

    IF month_currency IS NULL THEN
      RAISE EXCEPTION 'labor_allocation_runs_month_missing'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.currency IS DISTINCT FROM month_currency THEN
      RAISE EXCEPTION 'labor_allocation_currency_mismatch'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT r.currency INTO run_currency
  FROM public.labor_allocation_runs r
  WHERE r.id = NEW.labor_allocation_run_id
    AND r.organization_id = NEW.organization_id;

  IF run_currency IS NULL THEN
    RAISE EXCEPTION 'labor_allocation_run_lines_run_missing'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.currency IS DISTINCT FROM run_currency THEN
    RAISE EXCEPTION 'labor_allocation_currency_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS labor_allocation_runs_currency_guard ON public.labor_allocation_runs;
CREATE TRIGGER labor_allocation_runs_currency_guard
  BEFORE INSERT OR UPDATE OF currency, employee_month_cost_id, organization_id
  ON public.labor_allocation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_currency_guard();

DROP TRIGGER IF EXISTS labor_allocation_run_lines_currency_guard ON public.labor_allocation_run_lines;
CREATE TRIGGER labor_allocation_run_lines_currency_guard
  BEFORE INSERT OR UPDATE OF currency, labor_allocation_run_id, organization_id
  ON public.labor_allocation_run_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.labor_allocation_currency_guard();
```

Vendor currency match lives inside `app.ap_bill_project_allocations_guard` (section E/F/G).

### D — Labor line ranges

```sql
ALTER TABLE "labor_allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "labor_allocation_run_lines_percent_range";
ALTER TABLE "labor_allocation_run_lines"
  ADD CONSTRAINT "labor_allocation_run_lines_percent_range"
  CHECK ("percent" IS NULL OR ("percent" >= 0 AND "percent" <= 100));

ALTER TABLE "labor_allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "labor_allocation_run_lines_hours_non_negative";
ALTER TABLE "labor_allocation_run_lines"
  ADD CONSTRAINT "labor_allocation_run_lines_hours_non_negative"
  CHECK ("basis_hours" IS NULL OR "basis_hours" >= 0);

ALTER TABLE "labor_allocation_run_lines"
  DROP CONSTRAINT IF EXISTS "labor_allocation_run_lines_days_non_negative";
ALTER TABLE "labor_allocation_run_lines"
  ADD CONSTRAINT "labor_allocation_run_lines_days_non_negative"
  CHECK ("basis_days" IS NULL OR "basis_days" >= 0);
```

Conservation (`allocated + unallocated = known`, `SUM(lines) = allocated`) already exists in 0021 — keep it.

### E / F / G — Vendor NET cap, concurrency, draft→applied→superseded

```sql
ALTER TABLE "ap_bill_project_allocations"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "supersedes_allocation_id" uuid,
  ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone;

-- status CHECK, supersedes FK, replace unique index with active partial unique,
-- and CREATE FUNCTION app.ap_bill_project_allocations_guard() …
-- (full body in agent1-integrity-patch.sql)
```

**Rules encoded:**

1. Status lifecycle: `draft` → `applied` → `superseded` (smallest coherent history).
2. Cap: `SUM(amount) WHERE status IN ('draft','applied') ≤ ap_bills.total_amount` (**bill NET**, never payment applications).
3. `applied` only when bill status ∈ `{open, partially_matched, matched}` (existing AP recognition authority).
4. Currency must equal `ap_bills.currency`.
5. Void bill rejects active allocations.
6. Concurrency: `pg_advisory_xact_lock` + `SELECT … FOR UPDATE` on the bill row (same pattern as `ap_payment_applications_allocation_guard` in 0020).
7. Applied/superseded economic fields immutable; applied→superseded allowed.

### H — Assignment overlap concurrency

```sql
-- Replace app.employee_project_assignments_no_overlap() to take
-- pg_advisory_xact_lock(hashtext(org||employee||project)) before the range scan.
-- Optionally ADD EXCLUDE USING gist (…) WHERE status <> 'cancelled'
-- when CREATE EXTENSION btree_gist succeeds (Supabase). PGlite may lack gist;
-- advisory+trigger remain authoritative there.
```

Full SQL in patch file. Different projects may overlap; non-overlapping same project OK; overlapping same employee+project blocked.

### I — Contact UPDATE integrity

```sql
CREATE OR REPLACE FUNCTION app.client_contacts_project_pointer_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bad_project uuid;
BEGIN
  IF NEW.client_id IS NOT DISTINCT FROM OLD.client_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO bad_project
  FROM public.projects p
  WHERE p.primary_contact_id = NEW.id
    AND (
      p.client_id IS DISTINCT FROM NEW.client_id
      OR p.organization_id IS DISTINCT FROM NEW.organization_id
    )
  LIMIT 1;

  IF bad_project IS NOT NULL THEN
    RAISE EXCEPTION 'client_contacts_would_invalidate_project_pointer'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_contacts_project_pointer_guard ON public.client_contacts;
CREATE TRIGGER client_contacts_project_pointer_guard
  BEFORE UPDATE OF client_id, organization_id
  ON public.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION app.client_contacts_project_pointer_guard();
```

---

## Drizzle sync asks (Lead)

After folding SQL into 0021, mirror in schema:

- `employeeMonthCosts.adjustsMonthId` + quality/year_month checks
- `apBillProjectAllocations.status`, `supersedesAllocationId`, `appliedAt` + active partial unique
- Check constraints for labor line percent/hours/days

---

## Tests

| Suite | What |
|-------|------|
| `agent1-financial-integrity.test.ts` patched describe | A–E, G–I behavioral asserts after applying patch on disposable DB |
| concurrency describe | **F** + **H** real two-connection races via `@electric-sql/pglite-socket` + `postgres` (same harness family as e2e) |
| gap inventory describe | Documents missing triggers/columns on **current unpatched** 0021 as Lead BLOCKERs |

**Concurrency note:** Harness opens `@electric-sql/pglite-socket` with a `postgres` pool `max: 2` (two backend connections — same family as e2e). Under lock contention, PGlite socket may `ECONNRESET` the losing connection instead of surfacing `23514`. Tests treat that as contention failure **only if** final `SUM(active) ≤ bill NET` / single overlapping assignment holds. On real Postgres (`TEST_DATABASE_URL`), expect clean `over_bill_net` / `overlap` errors.

**How to run (local disposable only):**

```bash
npx vitest run tests/integration/pre0021/agent1-financial-integrity.test.ts
```

---

## Findings

### BLOCKER (Lead must fold before 0021 owner apply)

1. No `employee_month_costs` economic immutability / adjust pointer (A).
2. `year_month` accepts non-calendar months; quality/amount incoherent (B).
3. No labor/vendor currency chain (C).
4. No vendor bill NET allocation cap (E).
5. No vendor allocation concurrency lock (F).
6. No vendor `draft|applied|superseded` history (G).
7. Contact UPDATE can orphan/invalidate `projects.primary_contact_id` (I).

### HIGH

1. Labor line percent/hours/days checks missing (D) — amount>0 + conservation already present.
2. Assignment overlap is trigger-only without advisory lock / exclusion (H) — race window on real multi-connection Postgres.

### MEDIUM

1. PGlite lacks `btree_gist` — exclusion constraint is best-effort; advisory lock is the portable guarantee.
2. Conservation still re-reads live `known_amount` (Reviewer1 note) — month immutability after apply closes the practical hole; optional `source_amount` snapshot on runs remains a later nicety.
3. PGlite socket contention may reset connections — safety property asserted on final sums; prefer owner CI with real throwaway Postgres for crisp exception codes.
