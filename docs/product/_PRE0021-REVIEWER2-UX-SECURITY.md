# Pre-0021 Closure — Reviewer 2: UX + Security

**STATUS = COMPLETE (PASS WITH FINDINGS)**  
**Reviewer:** 2 — UX + Security  
**Date:** 2026-08-10  
**Contract:** `_PRE0021-LEAD-CONTRACT.md`  
**Inputs:** `_PRE0021-AGENT2-PERMISSIONS.md` · `_PRE0021-AGENT3-UX.md` · `_PRE0021-AGENT4-PERF.md` (cross-read only)  
**Surfaces:** employee-form · employee-projects-panel · project-team-roster · monthly-employer-cost-review · vendor-bill-allocation-panel · permissions catalog / role templates · worker authz tests  

**Forbidden (obeyed):** commit / push / `db:migrate` / edit `0021_*.sql` (no locale hotfix needed)

---

## 0. Verdict (checklist)

| # | Check | Result |
|---|--------|--------|
| 1 | Worker cannot see private compensation / employer cost unless explicitly permitted | **PASS (MUST BE NO)** — app asserts + templates + UI gates |
| 2 | Worker cannot mutate employer cost | **PASS (MUST BE NO)** — unit-proven |
| 3 | Simple customer path stays simple (employee create not overloaded) | **PASS** — first paint = name + job title; compensation under Advanced |
| 4 | Advanced optional (month / vendor behind `READY=false`) | **PASS** — both gates false; Save = session draft no-op |
| 5 | Mobile daily flow practical | **PASS** — full-width primary CTAs; short HE verbs; planned share under More |
| 6 | Assignment ≠ Actual; planned % never labeled הקצאה; End = סיים שיוך | **PASS** — locales + CTAs match binding |
| 7 | Optionality (works without salary / assignments / month / vendor alloc) | **PASS** |

**Overall:** Pre-0021 UX + app-layer security are **closure-ready** for default Owner / Manager / Worker / Finance templates. Residual items below are **HIGH/MEDIUM** (no new UX BLOCKER). Live DB RLS for compensation spine still depends on **unapplied** 0021 (Lead-owned).

---

## 1. Persona matrix (code + unit tests)

| Persona | Compensation READ | Employer-cost WRITE | Assign / End | Month strip | Vendor bill alloc UI |
|---------|-------------------|---------------------|--------------|-------------|----------------------|
| **Owner** | yes | yes | yes (`workforce.manage`) | yes (draft) | yes (`ap.manage`) |
| **Manager** | yes (`workforce.cost.read`) | **no** | no manage (read+time only) | yes view / draft only | yes (`ap.manage`) |
| **Finance** | yes | yes (`workforce.cost.manage`) | no employee-master manage | yes | **hidden while READY=false** (`ap.read` only → `canManage=false`) |
| **Worker** | **NO** | **NO** | no workforce keys | hidden | no AP keys |

Tests run:

```text
npx vitest run tests/unit/workforce/worker-compensation-authz.test.ts \
  tests/unit/workforce/pre0021-ux-gates.test.ts \
  tests/unit/shared/permissions.test.ts
→ 3 files / 24 tests PASSED
```

Playwright: **not run** (unit coverage sufficient for this gate; not cheaply required).

---

## 2. What works (do not regress)

1. **EMP ≠ COMPENSATION (app):** `workforce.cost.read` / `workforce.cost.manage` in catalog; worker template excludes both; `workforce.read` alone does not unlock `canReadWorkforceCost` / `listRateHistory` / month asserts.
2. **Create employee simple path:** `EmployeeForm` first paint = name + job title; rate / burden under Advanced; empty `baseRate` creates with no rate version; `createEmployee` requires `workforce.cost.manage` when a rate is supplied.
3. **Assignments:** Employee → **שיוכים** / **הוסף שיוך**; Project → **הוסף עובד**; End = **סיים שיוך**; muted **שיוך ≠ עלות עבודה בפועל**; planned field label **חלק זמן מתוכנן** (hint explicitly says not cost allocation).
4. **Gates:** `EMPLOYEE_MONTH_COSTS_READY = false`, `AP_BILL_PROJECT_ALLOCATIONS_READY = false`; env override only in `NODE_ENV=test`.
5. **0021 SQL (Lead, unapplied):** permission-aware RLS + cost catalog seed present for month costs / runs / `rate_versions` / `labor_cost_components` / AP bill allocations — correct direction; not live until migrate.
6. **Exports:** employee rate columns gated by `canReadWorkforceCost`; time cost columns require cost read **or** project financials.

---

## 3. Findings

Severity: **BLOCKER** = ships wrong security or wrong mental model for V1 defaults · **HIGH** = fix before / with 0021 apply or READY flip · **MEDIUM** = polish / residual / custom-role edge.

### BLOCKER

None for Pre-0021 UX + **app-layer** worker compensation gates on default templates.

*(Prior Agent 2 RLS membership-only BLOCKER is addressed in unapplied 0021 SQL per Lead note — ownership remains Lead apply, not this reviewer.)*

### HIGH

#### H1 — Employee detail always calls `listRateHistory` (Agent 2 claim not implemented)

`src/app/.../workforce/employees/[employeeId]/page.tsx` loads `listRateHistory` in the same `Promise.all` as assignments, **unconditional** on `showCosts`.

- `listRateHistory` → `assertCanReadWorkforceCost` (`workforce.cost.read` only).
- Any principal with `workforce.read` (assignments) but **without** `workforce.cost.read` gets `AuthorizationError` → page `catch` → **404 for the whole employee**, including Assignments.
- Contradicts Agent 2 delivery note (“Call `listRateHistory` only when costs visible”) and weakens EMP ≠ COMPENSATION for custom grants.

**Fix:** gate `listRateHistory` (and rate UI) on `canReadWorkforceCost` / `showCosts`; never fail the page for assignment-only viewers.

#### H2 — Vendor allocation panel visibility predicate is wrong when READY flips

`VendorBillAllocationPanel`: `if (!canManage && !ready) return null`.

| ready | canManage | Behavior |
|-------|-----------|----------|
| false | false | hidden (today OK) |
| false | true | shown draft |
| **true** | **false** | **shown** (read-only save disabled) |

When Lead sets `AP_BILL_PROJECT_ALLOCATIONS_READY=true`, any `ap.read` bill viewer sees the full split UI even without `ap.manage`. Prefer `if (!canManage && !canRead) return null` (or hide unless `ap.read`, mutate only with `ap.manage`) **before** flipping READY.

#### H3 — Live DB still membership-only on compensation spine until 0021 apply

App asserts protect service-role server actions. Authenticated/client paths to existing `rate_versions` / `labor_cost_components` remain membership-scoped on **applied** migrations. 0021 SQL re-policies them — **do not treat as closed in production until migrate**.

### MEDIUM

#### M1 — `canViewWorkforceCosts` OR with `project_financials.read` vs cost asserts

UI month strip / rate chrome uses `workforce.cost.read` **OR** `project_financials.read`. Strict cost asserts and `listRateHistory` require **only** `workforce.cost.read`. Default templates grant both together; custom financials-without-cost (or cost-without-financials) can desync UI vs loaders (ties to **H1**).

#### M2 — Time list / API still carries `costAmount` under `workforce.read`

UI/export redact; repository list still returns snapshotted labor Actual cost fields to workforce readers. Acceptable for Actual≠compensation-master, but not a full private-cost boundary. (Agent 2 M4 — still open.)

#### M3 — Finance cannot see vendor allocation draft while READY=false

Finance template: `ap.read` yes, `ap.manage` no → panel hidden today. Product intent may be manager-ops; if finance owns bill→project split preview, pass a `canRead` and show read-only draft under `ap.read`.

#### M4 — New employee Advanced does not hide rate fields without `workforce.cost.manage`

`showRateFields` defaults true; create page only asserts `workforce.manage`. Server correctly rejects rate-on-create without cost manage — but UI can tease fields that fail submit for custom manage-without-cost roles. Pass `showRateFields={canManageWorkforceCost(context)}`.

#### M5 — Month strip “בפועל” copy while gate off

`monthReview.simpleActualLine` always says employer cost **בפועל** even for empty/estimated session draft under `READY=false`. Gate alert + disclaimer mitigate; tighten copy so draft never reads as recognized Actual until READY + persistence.

#### M6 — Soft warn when planned shares sum > 100% still missing

Agent 3 M1 — optional; does not break Assignment ≠ Actual.

#### M7 — Existing-org `role_permissions` backfill

Templates + 0021 seed/backfill text cover new orgs / migrate path. Orgs provisioned before seed still need ops backfill for manager/finance cost keys (Agent 2 H3).

---

## 4. Terminology audit (binding)

| Rule | Evidence | Status |
|------|----------|--------|
| Planned % ≠ הקצאה | HE/EN `plannedShareLabel` = חלק זמן מתוכנן / Planned time share; hint negates cost allocation | **PASS** |
| End = סיים שיוך | `projectPanel.endAssignment*` — no Remove/הסרה primary | **PASS** |
| Assignment ≠ Actual | muted notes on create / employee projects / roster | **PASS** |
| Month/AP may say הקצאה | money allocation only (`monthReview.method`, `ap.allocation.*`) | **PASS** (correct domain) |

No tiny locale hotfix required.

---

## 5. Optionality / gates

| Capability | Optional? | Persistence |
|------------|-----------|-------------|
| Salary / rate on create | yes (Advanced) | only if `baseRate` + cost manage |
| Assignments | yes | existing team APIs |
| Month employer cost | yes (employee detail, permissioned) | **blocked** `EMPLOYEE_MONTH_COSTS_READY=false` |
| Vendor bill project alloc | yes (AP bill, above payments) | **blocked** `AP_BILL_PROJECT_ALLOCATIONS_READY=false` |

Product works as simple workforce + time without salary, assignments, month strip, or vendor split.

---

## 6. Mobile daily

- Roster / assign Save: `size="lg"` + `block`.
- Planned share + role under `<details>` / More.
- HE verbs short (הוסף עובד, דיווח שעות, סיים שיוך).
- Month review explicitly off field daily path (“לא בניווט היומי בשטח”).

**PASS** for Pre-0021 mobile practicality.

---

## 7. Delivery summary

```text
STATUS = COMPLETE (PASS WITH FINDINGS)
Proposal / files = docs/product/_PRE0021-REVIEWER2-UX-SECURITY.md
Schema asks for Lead = none from this reviewer (RLS already in unapplied 0021; apply before READY flip)
Tests run = vitest worker-compensation-authz + pre0021-ux-gates + permissions (24 passed)
BLOCKER = (none app/UX)
### Lead fixes (2026-08-10)

| ID | Status |
|----|--------|
| **H1** | Closed — `listRateHistory` only when `showCosts` |
| **H2** | Closed — vendor allocation panel requires `canManage` (no READY flip leak) |
| **H3** | Expected — RLS live after owner applies 0021 |
MEDIUM = M1–M7
NO COMMIT / NO PUSH / NO MIGRATE
```
