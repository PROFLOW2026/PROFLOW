# Pre-0021 Closure — Agent 3: Complete Real User UX

**STATUS:** COMPLETE  
**Owner:** Agent 3 — Workforce / AP product UX  
**Contract:** `docs/product/_PRE0021-LEAD-CONTRACT.md`  
**Also:** `_MASTER-WAVE-AGENT5-MOBILE-UX.md`, `_MASTER-WAVE-REVIEWER2-UX.md`  

**Forbidden (obeyed):** commit / push / `db:migrate` / edit `0021_*.sql` / invent payroll NET salary UI.

---

## 1. Verdict

Product UX for daily simple + optional advanced workforce/AP flows is wired to existing temporal assignment APIs. Month-cost and vendor-bill allocation UIs ship as **permissioned draft/preview** behind `READY=false` gates so they never claim Actual until Lead flips persistence after migration.

Locked separations preserved in UI copy:

```text
EMPLOYEE MASTER ≠ COMPENSATION ≠ ASSIGNMENT ≠ TIME ≠ MONTH COST ≠ ALLOCATION
VENDOR ≠ BILL ≠ BILL ALLOCATION ≠ PAYMENT
Assignment ≠ Actual. Payment ≠ Actual.
```

---

## 2. Delivered product surfaces

| ID | Surface | Behavior |
|----|---------|----------|
| **A** | Employee create | First paint = name + job title only. Compensation (rate expression, base rate, burden) under **Advanced**. Create with **no salary** works (no rate version written). |
| **B** | Employee → Assignments | Title **Assignments / שיוכים**. CTA **Add assignment / הוסף שיוך**. Project + From/To + optional planned time share + role. End = **סיים שיוך**. History toggle. Multi-project + re-assign after end. |
| **C** | Project → Team | Current roster with dates; history accessible; CTA **הוסף עובד**; full-width Save on phone; no cost from assign. Log time kept on time card only (roster assign-focused). |
| **D** | Monthly employer cost review | Permissioned (`workforce` costs / financials). Strip: Cost · Allocated · Unallocated · Status. Simple line: **עלות מעסיק בפועל החודש = X**. Methods hours/days/%/fixed under Advanced. Gate off → draft no-op. |
| **E** | Vendor bill allocation | On AP bill detail (above payments). 100% one project **or** split by amount/%/days. Live preview total/allocated/unallocated; block exceed recognized NET. Payment panel stays separate. Gate off → draft no-op. |
| **F** | Mobile daily | Full-width primary CTAs on assign/save; short HE verbs; Advanced collapsed; Assignment ≠ Actual one muted line retained. |

### Terminology (binding)

| Concept | EN | HE | Never |
|---------|----|----|-------|
| Planned % on assignment | Planned time share | חלק זמן מתוכנן | allocation / הקצאה |
| End assignment | End assignment | סיים שיוך | Remove / הסרה as primary |
| Disclaimer | Assignment ≠ labor Actual. | שיוך ≠ עלות עבודה בפועל. | Long tutorials |

---

## 3. Gates (Lead flip list)

| Flag | File | Default | Meaning when false |
|------|------|---------|-------------------|
| `EMPLOYEE_MONTH_COSTS_READY` | `src/modules/workforce/domain/monthly-cost-gates.ts` | `false` | Month UI = session draft only; does **not** write `employee_month_costs` / displace time Actual |
| `AP_BILL_PROJECT_ALLOCATIONS_READY` | `src/modules/ap/domain/vendor-bill-project-attribution.ts` | `false` | Vendor allocation UI = preview/draft only; financials still use header `project_id` |

**Do not flip** until 0021 applied + financial displacement / attribution consumers are live.

---

## 4. Files touched (code)

### Workforce UI / actions
- `src/modules/workforce/ui/employee-form.tsx` — simple first paint; Advanced compensation
- `src/modules/workforce/ui/employee-projects-panel.tsx` — Flow A assign + history + end
- `src/modules/workforce/ui/project-team-roster.tsx` — Flow B dates, planned share, history, full-width Save
- `src/modules/workforce/ui/project-time-panel.tsx` — history load; roster without duplicate Log time
- `src/modules/workforce/ui/monthly-employer-cost-review.tsx` — optional month strip
- `src/modules/workforce/domain/monthly-cost-gates.ts` — gate + preview math
- `src/modules/workforce/application/project-team.ts` — history + assignable projects; end → `completed`
- `src/modules/workforce/data/project-team.repository.ts` — soft-end completed; history lists
- `src/modules/workforce/index.ts` — exports
- `src/app/.../workforce/team/actions.ts` — start/end/planned share form fields
- `src/app/.../workforce/employees/[employeeId]/page.tsx` — assignments first; compensation collapsed; month review

### AP UI
- `src/modules/ap/ui/vendor-bill-allocation-panel.tsx` — split preview UI
- `src/app/.../procurement/ap/[billId]/page.tsx` — panel above payments

### Locales
- `src/locales/en/workforce.json`, `src/locales/he-IL/workforce.json`
- `src/locales/en/ap.json`, `src/locales/he-IL/ap.json`

### Tests
- `tests/unit/workforce/pre0021-ux-gates.test.ts`

---

## 5. Schema asks for Lead (UX only — no SQL edits by Agent 3)

1. Keep `employee_project_assignments` temporal columns (`start_date`, `end_date`, `planned_allocation_percent`, `status`) as already drafted — UI now depends on them.
2. Soft-end product semantics: **`status = completed` + `end_date`** (not hard delete). App path updated accordingly.
3. Flip `EMPLOYEE_MONTH_COSTS_READY` only with displacement wiring for `employee_month_costs` / labor runs.
4. Flip `AP_BILL_PROJECT_ALLOCATIONS_READY` only with persistence + financial attribution consuming allocation lines without double-counting header.

No new migration invented by this agent.

---

## 6. Tests run

| Check | Result |
|-------|--------|
| `vitest` unit `pre0021-ux-gates` | Run in agent session |
| `db:migrate` / apply 0021 | **Not run** (forbidden) |
| commit / push | **Not done** (forbidden) |

---

## 7. Findings

### BLOCKER
- None for Agent 3 UX delivery. Persistence of month/vendor remains correctly gated.

### Lead integration notes (2026-08-10)

- UX accepted; gates stay `READY=false`.
- Soft-end `completed` + `end_date` aligns with SQL overlap (terminal `cancelled` skipped; `completed` still date-checked — re-assign after end is OK).
- App conflict query uses same `status <> cancelled` rule as 0021 trigger.
- Month/vendor panels must remain behind cost/AP permissions (Agent 2) — verify on Reviewer 2 pass.

### MEDIUM
- **M1** — Planned time share soft-warn when sum > 100% across projects not yet implemented (optional; Agent 2 said soft warning only).
- **M2** — Month review lives on employee detail (permissioned), not Reports — fine for V1; move later if finance wants org-wide strip.
- **M3** — Vendor allocation draft does not yet write when READY=true (needs application layer when Lead enables).

---

## 8. Delivery summary

```text
STATUS = COMPLETE
Proposal / files = docs/product/_PRE0021-AGENT3-UX.md + workforce/AP UI + locales + gate test
Schema asks for Lead = flip READY gates after 0021 + confirm soft-end status=completed
Tests run = unit pre0021-ux-gates (session)
BLOCKER = (none)
HIGH = H1 draft-only until gates; H2 completed vs cancelled soft-end
MEDIUM = M1–M3
```
