# SCHEMA_REQUEST — Month Close (Agent 2)

Lead-owned migrations only. No SQL edited by this agent.

## Landed (usable)

- `month_close_periods` / `month_close_adjustments` in `drizzle/schema/next-gen.ts` + `0027`
- Permissions `month_close.read` / `month_close.manage`
- Optional module key `month_close`

## Gaps / requests

1. **Cross-module freeze wiring** — **Reviewer 1 FIXED (app layer)**  
   `assertMonthOpenForRewrite` is now called from expense finalize/void/reversal,
   AP bill create/void, credit apply, bill project allocation apply, and labor
   allocation apply. Admin-backed period read + 0029 RLS (CLOSED visibility)
   keep the freeze from silent no-op when actors lack `month_close.read`.

2. **DB-level freeze (optional hardening)**  
   No triggers yet that refuse silent UPDATE/DELETE of operational cost rows when `month_close_periods.status = 'closed'`.  
   Request if desired: triggers analogous to `labor_allocation_runs_month_closed`, keyed off `month_close_periods` (not `employee_month_costs.status`).

3. **Post-close adjustment → domain mutate API**  
   `month_close_adjustments` records intent only.  
   Request: optional link/callback so recording an adjustment unlocks a single supersede path in the owning module (labor run supersede, expense correction, AP allocation supersede) under `month_close.manage`.

4. **Open time corrections signal**  
   Currently counts `approval_requests` with `entity_type = 'time_correction'` and `status = 'submitted'`.  
   If Approvals agent changes entity taxonomy, update the collector. Prefer a dedicated time-correction queue if approvals stay off for simple orgs.

5. **Attendance applicability**  
   “Org uses attendance” = any `attendance_days` row ever.  
   Prefer org module preference / explicit attendance feature flag if one lands later.
