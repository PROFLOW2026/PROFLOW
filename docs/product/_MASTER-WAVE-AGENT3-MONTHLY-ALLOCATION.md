# Master Wave Agent 3 — Employee Monthly True-Cost Allocation

**Agent:** 3 — Monthly true-cost  
**Status:** COMPLETE (domain proposal only)  
**Date:** 2026-08-10  
**Commit / push / db:migrate / edit migrations:** FORBIDDEN  
**0021:** Do **not** place monthly-cost schema in the current contact/team 0021 scope (see §8).

---

## 0. Delivery header

```text
STATUS = COMPLETE
Proposal = docs/product/_MASTER-WAVE-AGENT3-MONTHLY-ALLOCATION.md
Schema asks = §7 (tables/columns only; Lead owns SQL)
Tests run = none (design-only; no code/migration edits)
BLOCKER / HIGH / MEDIUM = §11
```

---

## 1. Product goal (optional advanced)

Organizations that know an employee’s **monthly employer cost** (salary / monthly rate + burden + components, or an explicit monthly true-cost amount) must be able to say:

```text
KNOWN_EMPLOYER_COST(employee, calendar_month)
  = Σ project allocation lines
  + VISIBLE_UNALLOCATED
```

**Exactly 100%.** Never silently dump remainder onto a “default” project. Never pretend unallocated is zero when it is not.

Simple mode stays intact: no compensation history, no monthly periods, no allocations → today’s Mode C time snapshots continue to drive labor Actual unchanged.

---

## 2. Locked concept separation (contract)

| Concept | Role | Creates Actual? |
|---------|------|-----------------|
| EMPLOYEE MASTER | Person/costing entity | No |
| COMPENSATION HISTORY (Agent 1) | Effective-dated pay / burden inputs | No by itself |
| PROJECT ASSIGNMENT (Agent 2 / team) | Planned presence | **Never** |
| TIME ENTRY | Hours + optional `cost_amount` snapshot | **Yes today** (Mode C) |
| MONTHLY EMPLOYER COST | Known economic cost for a month | Yes **only via** applied allocation recognition (§4) |
| COST ALLOCATION | Split of known month cost → projects + unallocated | Recognition lines, not a second economic event |

VENDOR / BILL / PAYMENT paths are out of scope for this agent (Agent 4).

---

## 3. CRITICAL INVARIANT — one economic labor cost

### 3.1 Problem

Today Mode C already posts labor into project Actual:

```text
Project.laborActual += Σ time_entries.cost_amount
  (project kind, currency match, via getProjectLaborCost → aggregateProjectCosts)
```

`cost_amount` is snapshotted at log time from `rate_versions` (+ burden/components). That is a **provisional, time-driven estimate** of employer cost, not necessarily the organization’s **known monthly employer cost**.

If we also allocate `KNOWN_EMPLOYER_COST` onto projects and keep summing time snapshots, we **double-count** the same economic labor.

Mode B (`labor` category expenses) is already displaced when Mode C has workforce data (`LABOR-COST-INTEGRITY.md`). Monthly allocation must extend that same “one source wins” discipline — not invent a third Additive stack.

### 3.2 Binding invariant (for Lead)

```text
INVARIANT — ONE ECONOMIC LABOR COST PER EMPLOYEE-MONTH (AND PER PROJECT SLICE)

For any organization that enables monthly workforce cost recognition:

  (A) There is exactly ONE recognition source for labor Actual for a given
      (employee, calendar_month) once that month is APPLIED or CLOSED:

        recognition_source ∈ { TIME_SNAPSHOT, MONTHLY_ALLOCATED }

  (B) TIME_SNAPSHOT and MONTHLY_ALLOCATED are mutually exclusive for that
      employee-month. Never add:
        Σ time_entries.cost_amount  +  Σ monthly_allocation_lines
      for the same employee-month into project Actual.

  (C) Conservation of known cost (when monthly source is used):
        known_employer_cost
          = Σ allocation_line.amount [project targets]
          + unallocated_amount
        with unallocated_amount always stored and disclosed (may be > 0).
        Forbidden: silent distribution of remainder; forbidden: drop remainder.

  (D) ASSIGNMENT ≠ Actual. Planned team / temporal assignment may only supply
      FALLBACK WEIGHTS when building a draft allocation — never write Actual alone.

  (E) Mode B labor expenses remain excluded on projects that have workforce
      labor recognition (existing V1 rule), whether recognition is TIME_SNAPSHOT
      or MONTHLY_ALLOCATED.
```

### 3.3 Transition / reconciliation model (recommended)

**Name:** Displacement with provisional → applied (mirrors expense `allocation_runs` draft → applied freeze).

| Phase | `employee_month_cost.status` | What financials use for that employee-month |
|-------|------------------------------|-----------------------------------------------|
| No monthly cost row / feature off | — | **TIME_SNAPSHOT** (current behavior). Monthly engine idle. |
| `draft` | Open worksheet | **Still TIME_SNAPSHOT** for Actual. UI may show **Estimated** monthly allocation vs time-driven total (advisory gap only). |
| `applied` | Recognition switched | **MONTHLY_ALLOCATED** for that employee-month. Time `cost_amount` rows remain audit/basis; **excluded from Actual** for dates in that month for that employee. |
| `closed` | Period close | Same as applied for Actual; run + known cost immutable (reopen = explicit supersede / new run). |
| `superseded` | History | Ignored for Actual; prior applied/closed retained for audit. |

**Open (unclosed) months:** keep time-driven Actual so mid-month project P&L does not wait on payroll close.

**Closed/applied months:** Actual labor for those employee-days flips to allocation lines. Coverage disclosure must say `labor_recognition=monthly_allocated` (and counts of displaced time snapshots).

**Gap metrics (always visible when both exist in draft):**

```text
time_driven_total   = Σ cost_amount for employee in month (incl. non-project)
known_employer_cost = employee_month_costs.known_amount
allocation_gap      = known_employer_cost − time_driven_total   (informational)
unallocated_amount  = known − Σ project lines                   (conservation residual)
```

`allocation_gap` is **not** posted as Actual. Only conservation residual is the visible unallocated bucket.

### 3.4 Rejected alternative (do not ship as V1)

**Delta posting** (`adjustment = allocated − Σ time_cost` per project) keeps two additive streams and invites rounding / correction bugs. Reserve for a later explicit “correction entry” tool if Owner demands continuity of mid-month snapshots in Actual history. Displacement is the Master Wave default.

### 3.5 Interaction with rate units

- Hourly/daily rates → time snapshots are natural provisional Actual.
- Monthly `rate_unit` already prorates via `STANDARD_HOURS_PER_MONTH` (160) into `cost_amount` — that remains **estimate**, not conservation of known monthly employer cost.
- When Agent 1 supplies a true monthly employer amount, that amount is the `known_employer_cost` input to allocation; time hours become **weights**, not a second cost.

---

## 4. Allocation engine design

### 4.1 Inputs

1. **Known employer cost** for `(organization, employee, year_month)` — from compensation history (Agent 1) or manual override amount on the month row.
2. **Method** (explicit or org/employee default — never silent):
   - `hours` — weight by project time hours in month (`labor_hours_weight` analogue)
   - `days` — weight by distinct work days (or active assignment days) in month
   - `manual_percent` — operator % lines (must sum to 100% **or** leave remainder as unallocated — see §4.3)
   - `manual_amount` / `fixed` — operator fixed amounts (residue → unallocated)
   - `manual_override` — replace entire computed draft with operator lines (still conservation-checked)
3. **Basis priority** when auto-building a draft (product order):

```text
1. Actual time in month (hours or days per method)
2. Monthly reconciliation choice (explicit method / prior month template)
3. Planned assignment fallback (Agent 2 temporal assignment ∩ month, else project_team_members)
```

If priority 1 yields no project bases and fallback yields none → **100% VISIBLE_UNALLOCATED** (allowed; not an error). Do not invent equal split.

`equal_split` only if explicit policy (same rule as expense allocation-policy).

### 4.2 Non-project time

Non-project time entries **do not** create project Actual today. Under monthly allocation:

- Hours on non-project codes may optionally reduce the **allocatable-to-projects** pool (org setting), with that slice labeled `non_project_hold` inside unallocated / overhead disclosure — **or** stay outside weights entirely (default V1: non-project hours are **not** a project weight; their cost sits in unallocated unless operator allocates).
- Default V1 recommendation: **weights = project hours/days only**; any known cost not placed on projects = `unallocated_amount` (visible). Non-project time explains *why* unallocated exists but does not auto-create fake projects.

### 4.3 Conservation rules

Reuse expense allocator semantics (`resolveAllocationLines` / weight residue on last line) **plus**:

| Case | Behavior |
|------|----------|
| Weight bases exist | Allocate 100% of known cost across projects by weights (residue on last project by deterministic id sort) — **only when method is weight and operator did not request holdback**. |
| Weight bases empty | 100% unallocated; no silent equal_split. |
| Manual % sum &lt; 100% | Remainder → **unallocated** (visible). Not an error. |
| Manual % sum &gt; 100% | DomainRuleError — reject. |
| Manual amounts sum &lt; known | Remainder → unallocated. |
| Manual amounts sum &gt; known | DomainRuleError — reject. |
| Manual override | Same conservation checks; explanation marks `override=true`. |

**Forbidden:** auto-push unallocated onto largest project / home project / “first assignment”.

### 4.4 Reuse of `allocation_runs` patterns

Do **not** overload `allocation_runs.expense_id` (NOT NULL today; expense-scoped). Propose a **parallel** labor run family that copies behavioral contracts:

| Expense pattern (0014/0017/0018) | Labor monthly analogue |
|----------------------------------|-------------------------|
| Source = expense NET | Source = `employee_month_costs.known_amount` |
| `allocation_runs` + `allocation_run_lines` | `labor_allocation_runs` + `labor_allocation_run_lines` |
| status `draft` \| `applied` \| `superseded` | Same + `closed` (period close) **or** close flag on month row |
| Applied snapshot immutable; recompute → supersede + new run | Same |
| Active uniqueness per (source, slice) | Active uniqueness per `(employee_month_cost_id)` (one month = one slice) |
| explanation JSON (method, bases, percents) | Same + recognition_source, basis_priority_used, displaced_time_entry_count |
| No silent equal_split | Same |
| Freeze applied slices on re-run | Month close freezes; draft recompute only while not closed |

Optional Lead simplification: polymorphic `allocation_runs` with `source_type` + `source_id` — **only if** Lead wants one table; Agent 3 prefers parallel tables to avoid risking expense run guards (0018).

### 4.5 Period close foundation (thin)

Enough for estimated vs actual without payroll GL:

1. Month row holds `known_amount` (actual employer cost or estimated).
2. `cost_basis`: `estimated` \| `actual` (label only — both obey conservation).
3. `closed_at` / status `closed` blocks edits; reopen = supersede path.
4. Financials: until applied/closed, Actual stays time-driven; after applied, displacement (§3.3).
5. No statutory payslip import, no GL export in this wave.

---

## 5. Financials integration (domain only)

### 5.1 `aggregateProjectCosts` / labor contribution

Extend `LaborCostContribution` conceptually:

```text
laborActual =
  Σ TIME_SNAPSHOT costs for employee-days NOT covered by an applied/closed month
+ Σ MONTHLY_ALLOCATED lines targeting this project for applied/closed months
```

`hasWorkforceData` remains true if either stream has data (keeps Mode B exclusion).

New coverage partials (names illustrative):

- `labor_month_allocated` — count of applied employee-months affecting project
- `labor_time_displaced_by_month` — count of time entries excluded due to displacement
- `labor_month_unallocated_org` — org-level visible unallocated (not forced into project profit)

### 5.2 Org reconciliation (labor layer)

Mirror expense org reconciliation (`org-cost-reconciliation.ts`):

```text
Σ project labor Actual (after recognition rules)
+ Σ visible labor unallocated (applied months)
= Σ known_employer_cost (applied/closed months)
  + Σ remaining TIME_SNAPSHOT costs (employees/months not on monthly recognition)
```

Disclose mixed regimes; never claim “complete true cost” when months are draft-only.

### 5.3 Currency

Same as time labor today: month known cost currency must match org/project rules; foreign currency lines excluded with partial reasons (reuse labor FX exclusion patterns).

---

## 6. What stays out of current 0021

Current `0021_project_contacts_and_team.sql` is **contact FK + `project_team_members` only**.

| In 0021 (existing draft) | Out of 0021 (Agent 3) |
|--------------------------|------------------------|
| `project_team_members` | `employee_month_costs` |
| `primary_contact_id` | `labor_allocation_runs` / lines |
| Composite employee/project UQ indexes | Period close / recognition flags |
| Assignment ≠ Actual (already stated) | Displacement logic in financials |

**Ask for Lead:** place monthly-cost schema in **redesigned 0021 only if Lead intentionally expands that migration**, otherwise **`0022_labor_monthly_allocation.sql`** (or next free number). Agents must not edit migration files.

Assignment rows may later feed **fallback weights only**; they must not gain cost columns in 0021.

---

## 7. Schema asks for Lead (tables / columns only)

No SQL. No Drizzle edits by this agent.

### 7.1 `employee_month_costs`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `organization_id` | Tenant |
| `employee_id` | FK employees |
| `year_month` | `date` first-of-month **or** (`year`,`month`) — Lead choice; unique with employee |
| `known_amount` | Money — known employer cost |
| `currency` | |
| `cost_basis` | `estimated` \| `actual` |
| `status` | `draft` \| `applied` \| `closed` \| `superseded` |
| `compensation_version_id` | nullable FK — Agent 1 artifact if present |
| `manual_known_override` | bool — operator replaced computed known amount |
| `notes` | nullable |
| `closed_at` / `closed_by_user_id` | nullable |
| `created_by_user_id` | nullable |
| timestamps | |

Constraints (intent): unique active `(organization_id, employee_id, year_month)` where status in (`draft`,`applied`,`closed`); immutability guards akin to 0018 when `closed` or `applied` snapshot fields change.

### 7.2 `labor_allocation_runs`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `organization_id` | |
| `employee_month_cost_id` | FK source (not expense) |
| `method` | `hours` \| `days` \| `manual_percent` \| `manual_amount` \| `manual_override` (+ optional `equal_split` if explicit) |
| `status` | `draft` \| `applied` \| `superseded` (close may live on month row) |
| `period_start` / `period_end` | Calendar month bounds |
| `source_amount` | = known_amount |
| `allocated_to_projects_amount` | Σ project lines |
| `unallocated_amount` | Conservation residual — **required column**, never implicit |
| `currency` | |
| `basis_priority_used` | `time` \| `reconciliation` \| `assignment_fallback` \| `manual` |
| `explanation` | jsonb |
| `run_at`, `created_by_user_id` | |
| timestamps | |

Active uniqueness: one `draft|applied` run per `employee_month_cost_id`.

### 7.3 `labor_allocation_run_lines`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `organization_id` | |
| `run_id` | FK |
| `project_id` | nullable — **null means unallocated bucket line** OR use separate run-level `unallocated_amount` only (prefer run-level unallocated + project-only lines to match expense lines always having project_id) |
| `basis_value` / `basis_unit` | `hours` \| `days` \| `percent` \| `money` |
| `weight_percent` | |
| `amount` / `currency` | |
| `explanation` | jsonb |
| `sort_order` | |
| timestamps | |

**Recommendation:** keep lines project-only (like expense `allocation_run_lines`); store unallocated on the **run** header so UI always has a first-class residual field.

### 7.4 Org / feature flags (settings keys — not necessarily tables)

| Key | Purpose |
|-----|---------|
| `workforce.monthly_cost.enabled` | Feature off = TIME_SNAPSHOT only |
| `workforce.monthly_cost.default_method` | hours / days / … |
| `workforce.monthly_cost.auto_apply_on_close` | optional |
| `workforce.monthly_cost.non_project_in_weights` | default false |

### 7.5 Explicitly not requested

- Mutating `time_entries.cost_amount` on month apply  
- Cost columns on `project_team_members`  
- Extending expense `allocation_runs.expense_id` to nullable polymorphic without Lead design  
- Payroll statutory tables / payslip import  
- Writing Actual from assignment alone  

---

## 8. Application sketch (no implementation this agent)

Suggested modules (future):

- `src/modules/workforce/domain/monthly-employer-cost.ts` — conservation, method resolve, basis priority  
- `src/modules/workforce/domain/labor-recognition.ts` — TIME_SNAPSHOT vs MONTHLY_ALLOCATED displacement set  
- `src/modules/workforce/application/run-monthly-labor-allocation.ts` — mirror `run-automatic-allocation.ts`  
- `src/modules/financials/domain/cost-aggregation.ts` — consume recognition helper  
- Extend `LABOR-COST-INTEGRITY.md` with monthly displacement section when implemented  

---

## 9. Tests to require at implementation (not run now)

1. Conservation: known = Σ projects + unallocated (manual % &lt; 100%, empty bases → 100% unallocated).  
2. No double-count: applied month displaces time snapshots for that employee-month on project Actual.  
3. Draft month does not displace Actual.  
4. Assignment-only employee-month with no time → unallocated 100% unless operator allocates (fallback weights only when assignments exist **and** method allows).  
5. Mode B labor expense still excluded when monthly-allocated workforce data present.  
6. Closed run immutable; supersede path creates new run.  
7. Feature flag off → byte-stable with current Mode C behavior.

---

## 10. Dependencies on other agents

| Agent | Need |
|-------|------|
| 1 Compensation | Stable shape for computing `known_amount` from history (or Lead accepts manual-only known amount in V1) |
| 2 Temporal assignments | Fallback weight window API; must not emit Actual |
| 4 Vendor allocation | No shared Actual collision; labor unallocated ≠ vendor unallocated |
| Lead | Migration placement, immutability guards, final recognition enum names |

---

## 11. Findings

### BLOCKER

1. **Lead must accept Displacement (§3.3) as the binding recognition model** (vs delta adjustments). Without this, Agent 7 financials and Mode B integrity cannot be implemented safely.  
2. **`known_employer_cost` source of truth** depends on Agent 1 compensation proposal (or interim manual-only month amount). If Agent 1 is delayed, Lead should still allow manual `known_amount` so allocation can ship.

### HIGH

1. Financial aggregation must gain an employee-month displacement index (date range × employee) — non-trivial query shape vs today’s simple `sum(cost_amount)`.  
2. Mid-month apply (closing before month ends) needs a rule: recommend **apply only after month end** or treat `period_end=today` with explicit operator confirm; otherwise time logged after apply is ambiguous (propose: post-apply time in same month either forbids entry cost into Actual or requires reopen — Lead pick).  
3. Parallel `labor_allocation_*` tables vs polymorphic `allocation_runs` — Lead architecture choice before SQL.

### MEDIUM

1. Default treatment of non-project time vs unallocated disclosure copy.  
2. Whether `closed` is a run status or only a month-row flag.  
3. Org reporting: show labor unallocated beside expense unallocated without merging buckets.  
4. Hebrew/UX strings for estimated vs actual month cost (Agent 5).  

---

## 12. Summary for Lead

Optional monthly workforce cost engine conserves **100% of known employer cost** into project lines + **visible unallocated**, reusing expense allocation-run lifecycle patterns without overloading expense tables.  

**INVARIANT:** once an employee-month is applied/closed, project labor Actual for that slice comes **only** from monthly allocation lines; time-entry `cost_amount` is basis/audit and must not also add. Before apply, Actual stays today’s time snapshots; assignment never creates Actual. Keep all of this **out of** contact/team 0021 unless Lead explicitly redesigns that migration.
