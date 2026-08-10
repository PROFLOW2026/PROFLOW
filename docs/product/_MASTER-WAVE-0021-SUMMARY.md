# Master Wave — Lead 0021 redesign summary

**Filename:** `drizzle/migrations/0021_workforce_contacts_and_allocations.sql`  
**Applied:** NO  
**Replaces draft:** `0021_project_contacts_and_team.sql` (deleted, unapplied)

## Contents

1. **Project contact** — single-column FK `ON DELETE SET NULL`; org+client guard trigger; contact-delete clears pointer only
2. **`employee_project_assignments`** — temporal spans; overlap guard; assignment ≠ Actual
3. **Compensation** — `employees.employment_basis` (+ hire/end); `rate_versions` estimated/source/quality/locked; **`employee_month_costs`**
4. **Labor allocation** — `labor_allocation_runs` + lines; conservation trigger; Displacement recognition model
5. **`ap_bill_project_allocations`** — multi-project bill slices; payment untouched

## Explicitly out

- Attendance/time-clock tables
- Payroll/net/tax engines
- Magic ×1.25 burden

## Optionality

All new advanced tables optional — empty org behaves as Mode C / single-project AP today.

## Schema wire (app/Drizzle) — DONE 2026-08-10

- Drizzle `workforce.ts` / `ap.ts` match 0021 tables (no `project_team_members`)
- Team add/remove → temporal assign + soft-end cancel
- `AP_BILL_PROJECT_ALLOCATIONS_READY = false` until apply
- Spot typecheck after wire: PASS
- Agent unit/integration subset: 21 passed (wire agent)

## Reviewer 1 follow-ups (closed in SQL/app, still unapplied)

- Displacement coupling + apply trigger; conservation includes line sums; immutability; active-run uniqueness
- Vendor attribution helper + gated loader (`AP_BILL_PROJECT_ALLOCATIONS_READY=false` until apply)
- LABOR-COST-INTEGRITY.md §5 Displacement
