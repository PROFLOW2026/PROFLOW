# BUG-02 — Employee salary / payroll approval flow crash (read-only audit)

**Date:** 2026-11-14  
**Scope:** Owner main app payroll approval path; employee app month-cost review (parity).  
**Commits checked:** `787623f0`, `3cffcab7`, `b2f0b9e7`, `0c43a36e`, migrations `0200`–`0203`.

---

## Severity

**P1** — Blocks opening the canonical payroll approval deep link for many real employees (Today / Command Center → confirm payroll), showing `[locale]/error.tsx` (“משהו השתבש”) instead of approval UI.

---

## User-visible symptom

Generic locale error boundary (`src/app/[locale]/error.tsx` → `errors.errorPage.title` / body), **not** `errors.notFoundPage` (“הדף לא נמצא”).

---

## Canonical flow (what “salary approval” means in product)

| Step | Route / action | Code |
|------|----------------|------|
| Alert source | Today inbox / Command Center | `collectPayrollDueToday` → `payroll_pending_review` \| `payroll_due_today` \| `payroll_overdue` |
| Deep link | `/workforce/employees/{employeeId}?yearMonth=YYYY-MM&focus=payroll&paymentId={uuid}` | `payrollAlertHref` in `alert-deep-links.ts` |
| Server load | Employee detail RSC | `src/app/[locale]/(app)/workforce/employees/[employeeId]/page.tsx` |
| Approval UI | Month employer cost + cash confirm | `MonthlyEmployerCostReview` (`payrollApprovalMode`) + `EmployeePayrollMonthPanel` |
| Confirm paid | Server action | `confirmPayrollPaymentAction` → `confirmPayrollPaid` (`WORKFORCE_MANAGE`) |

**Mobile vs desktop:** Same route; layout is responsive. No separate mobile route.

**Employee app:** Month review only at `src/app/[locale]/employee/(shell)/workforce/employees/[employeeId]/page.tsx` (no `EmployeePayrollMonthPanel` / `paymentId` deep link on that surface).

---

## Root cause (primary)

### RSC → client props pass raw Drizzle rows with `Date` fields into `MonthlyEmployerCostReview`

1. Payroll deep links always set `paymentId` (and usually `yearMonth`, `focus=payroll`).
2. Page loads `monthReview` via `loadMonthlyEmployerCostReview` (when `canReadWorkforceCost`).
3. When **any** historical `employee_month_costs` row exists,  
   `showMonthReview = monthReview?.month \|\| monthReview?.months?.length > 0` is **true** even for the alert month alone.
4. On the payroll path, the page renders **`MonthlyEmployerCostReview`** (a **client** component) with  
   `initialReview={monthReview}` **before** `EmployeePayrollMonthPanel`.

`MonthlyEmployerCostReview` is typed to accept `MonthlyEmployerCostReview` from `employer-month-costs.ts`, whose `month`, `months`, `run`, and `lines` are **Drizzle `$inferSelect` rows** including `timestamp(..., { mode: 'date' })` → **`Date` instances** (`createdAt`, `updatedAt`, `lockedAt`, `appliedAt`, etc.).

The codebase already documents the required pattern elsewhere:

```8:9:src/modules/tasks/ui/serialize-task-cards.ts
/** Ensures RSC → client boundaries receive JSON-serializable task cards. */
export function serializeTaskCardsForClient(tasks: readonly TaskCardData[]): TaskCardData[] {
```

**Workforce month review has no equivalent serializer.** Passing `initialReview` from the employee **server** page into the **client** `MonthlyEmployerCostReview` triggers a Next.js RSC serialization failure at render time → bubbles to **`[locale]/error.tsx`** (generic “משהו השתבש”), with digest-only logging (`app.error`).

**Why it “used to work”:** Employees **without** `employee_month_costs` history have `showMonthReview === false` on the payroll path; only `EmployeePayrollMonthPanel` mounts (primitives only) → no crash. After month-cost apply / labor allocation / payroll integration (historical rows), opening the same alert **always** mounts `MonthlyEmployerCostReview` with non-serializable props.

**Confidence:** **High** (structural; matches error surface; matches existing `serializeTaskCardsForClient` precedent). **Not** confirmed with a live Production stack trace in this audit (read-only).

---

## Secondary / contributing factors

| Issue | Impact | Severity |
|-------|--------|----------|
| Page `try/catch { return null }` around entire loader | DB/auth errors → `notFound()` (404), masking real failures | P2 diagnostics |
| `loadMonthlyEmployerCostReview(...).catch(() => null)` on owner page | DB errors drop month review silently; payroll panel may still show | P3 |
| `EmployeePayrollMonthPanel`: `money()` / `businessDate()` on render | Invalid `expectedAmount` / `paidAt` → **client** throw → same error boundary | P2 conditional |
| Confirm UI uses `canManageCosts` (`WORKFORCE_COST_MANAGE`); action uses `WORKFORCE_MANAGE` | Misconfigured roles see button but action fails (mapped error, not page crash) | P3 |
| `getPayrollPayment` requires `WORKFORCE_READ`; month review requires `WORKFORCE_COST_READ` | Deep link without cost read loads employee but **no** payroll block | P3 product |

---

## Migrations 0200–0203 / schema alignment

| Migration | Payroll / EMC impact |
|-----------|---------------------|
| `0200_exlfy_evolution_local.sql` | New EXLFY tables; **no** `employee_month_costs` / `employee_payroll_payments` changes |
| `0201_planning_baselines_project_goals.sql` | Planning/goals only |
| `0202_automation_task_scan_presets.sql` | Automations only |
| `0203_tasks_work_package_id.sql` | `tasks.work_package_id` only; **not** time_entries (column exists since foundation) |

**Verdict:** Recent EXLFY migrations are **unlikely** direct cause. Runtime risk remains **0084 allocation-intent columns** probe (`allocation-intent-schema.ts`) for labor runs / employee selects — handled with column omission when probe fails; would tend to empty `monthReview` or `notFound`, not generic error, unless probe cache is stale.

---

## Link to cited commits

| Commit | Payroll relevance |
|--------|-------------------|
| `0c43a36e` | EXLFY features; **no** workforce payroll files in stat |
| `787623f0` | BOQ client barrel only |
| `3cffcab7` | `0203` tasks + locales; **no** payroll |
| `b2f0b9e7` | Tests only |

Regression timing is more consistent with **more employees having EMC history** + **payroll path always pairing** `MonthlyEmployerCostReview` when `showMonthReview` (since `20841b78`, Sep 2025) than with EXLFY migrations.

---

## Blast radius

- **Owners / finance** opening Command Center payroll items (`confirmPaid: 'payroll'`) for employees with **any** `employee_month_costs` row.
- **Employee app** month-cost page for the same employees (`initialReview` passed unsanitized to the same client component).
- **Not** affected: employees with payroll obligation only and **no** EMC history (month review hidden on payroll path).
- **Confirm / correct actions** (server actions) are separate; this bug is **open / render**, not submit.

---

## Proposed fix (no implementation)

1. **Add** `serializeMonthlyEmployerCostReviewForClient()` (mirror `serialize-task-cards.ts`): ISO strings for all `Date` fields; optional narrow DTO type for client props (no Drizzle row types on client boundary).
2. **Apply** on owner `employees/[employeeId]/page.tsx` and employee-app workforce employee page before passing `initialReview`.
3. **Ensure** `loadMonthlyEmployerCostReviewAction` return value is already JSON-safe when consumed from client refetch (server action boundary serializes once; keep consistent shape).
4. **Hardening:** `employees/[employeeId]/error.tsx` with workforce-specific copy; safe display helpers in `EmployeePayrollMonthPanel` for money/dates.
5. **Verify** in browser: deep link with `paymentId` for employee **with** EMC history; expect no digest `app.error` and both panels visible.

---

## Verification checklist (for fix PR)

- [ ] Open `/workforce/employees/{id}?yearMonth=…&focus=payroll&paymentId=…` as owner with `WORKFORCE_COST_READ`
- [ ] Employee with ≥1 `employee_month_costs` row (any month)
- [ ] Desktop + mobile width
- [ ] Save draft / apply / confirm paid / retroactive correction (owner) — regression smoke
- [ ] Employee app month review same employee
- [ ] Server log: no RSC “plain object” / Date serialization errors

---

## Evidence pointers

- Deep link: `src/modules/command-center/domain/alert-deep-links.ts` (`payrollAlertHref`)
- Payroll path mount: `src/app/[locale]/(app)/workforce/employees/[employeeId]/page.tsx` (~638–676)
- Loader: `src/modules/workforce/application/employer-month-costs.ts` (`loadMonthlyEmployerCostReview`)
- Client UI: `src/modules/workforce/ui/monthly-employer-cost-review.tsx` (`initialReview`)
- Error UI: `src/app/[locale]/error.tsx`
- Serialization precedent: `src/modules/tasks/ui/serialize-task-cards.ts`
