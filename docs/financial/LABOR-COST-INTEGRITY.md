# Labor Cost Integrity (Time vs Labor Expense)

**Status:** Wave 2 Agent 3 — IMPLEMENTED (2026-08-09)  
**Scope:** Prevent double-counting Mode B labor expenses with Mode C time-entry True Cost.

Legend: **CURRENT** | **IMPLEMENTED** | **RULE**

---

## 1. Product modes (doc 06 / 39)

| Mode | How labor enters Actual |
|------|-------------------------|
| **A** — No workforce | Expenses / subs only; no time True Cost |
| **B** — Generic labor expense | Finalized expense in system category key `labor` (or equivalent lump sum) |
| **C** — Employee-level costing | Time entries → rate / burden → `cost_amount` → project labor Actual |

Organizations may use B or C (or neither). Using **both on the same project** without a rule would double Actual.

---

## 2. V1 RULE (defensible)

**When a project has workforce project-time labor data (`hasWorkforceData`), finalized expenses whose cost category key is `labor` are excluded from Actual Cost / profitability for that project.**

- Time-entry True Cost remains the labor Actual source (Mode C wins for that project).
- Other expense categories (materials, subcontractor, etc.) still count.
- Projects **without** workforce labor data still include `labor` category expenses (Mode B).
- Org home dashboard applies the same rule per project id (labor expenses excluded only for projects that have time-entry labor).

This is not payroll software. Category key `labor` is the V1 signal for “payroll / wage lump sum expense.” Custom categories renamed away from key `labor` are not auto-excluded (by design — key is stable; display name may change).

---

## 3. Enforcement

| Layer | Behavior |
|-------|----------|
| Loader | `loadProjectExpenseContributions` / org loader attach `isLaborCategory` + `projectId` |
| Aggregation | `aggregateProjectCosts` skips labor-category lines when workforce labor applies |
| Coverage | Partial reason `labor_category_excluded_for_workforce` (count of excluded lines) |
| Docs | This file + Source of Truth / Flow Audit |

Code: `src/modules/financials/domain/labor-expense-integrity.ts`, `cost-aggregation.ts`.

---

## 4. Out of scope (V1)

- Auto-detecting free-text “salary” descriptions without category `labor`
- Statutory payroll connectors
- Splitting employer burden between expense and time (burden lives on RateVersion)
