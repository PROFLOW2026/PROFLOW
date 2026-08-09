# Allocation Engine Notes (Wave 2 Agent 1)

**Status:** IMPLEMENTED domain + migration `0014_allocation_engine` (2026-08-09)  
Lead consolidates into `docs/financial/*`.

## Classifications

| Class | `cost_family` / targeting |
|-------|---------------------------|
| DIRECT | `direct_project` + `project_id` — no auto allocation |
| SHARED | `shared` + null project — allocate to selected/eligible projects |
| OVERHEAD | `business_overhead` (and non-project) — allocate across eligible projects |

## Methods

| Code | Behavior |
|------|----------|
| A `manual_amount` | Existing — sums to **gross** (`amount_basis=gross`) |
| B `manual_percent` | Existing — % of gross |
| C `contract_weight` | Current Contract **NET** (sum of value events on primary contract) |
| D `labor_hours_weight` | Valid project time hours in `[period_start, period_end]` |
| E `direct_cost_weight` | Finalized direct project expense **NET** in period |
| F `equal_split` | Unit basis per eligible project — **only when explicit** (request / category / org policy) |

## Period & eligibility

- `expenses.allocation_period_start` / `allocation_period_end` (inclusive)
- Eligible: not draft/cancelled/archived; calendar span overlaps period (null start/end = open)
- Mid-period start/end included
- Periodic modes (`0017`): monthly slices; within each slice, **active-day exposure** for `contract_weight` / `equal_split` (`effective = driver × activeDays/sliceDays`; equal_split uses active days as basis). Labor hours / direct cost are **inherent** (slice-scoped query) — no second proration. See `COST-ALLOCATION-MODEL.md`.

## History / snapshots

Tables `allocation_runs` + `allocation_run_lines` freeze basis, %, amounts, and explanation JSON.  
Finalize sets run `status=applied`. Later contract growth does **not** rewrite applied snapshot amounts — recompute may set status `superseded` then insert a **new** run (`0018` DB guards).  
Active uniqueness: at most one `draft|applied` run per `(expense_id, slice_index)`.

## Amount basis

- Auto weight lines: `amount_basis=net`, SUM = allocatable NET
- Manual lines: `amount_basis=gross` (financials still scales net/gross)
- `loadProjectExpenseContributions` uses net lines as-is; gross lines scaled

## Policy

- `cost_categories.default_allocation_method` (nullable, configurable)
- Org setting key `allocation.default_method`
- Priority: explicit → category → org → none
- No hardcoded example drivers in application code

## Reference

Contracts A/B/C = 1M / 600k / 400k; insurance 24k `contract_weight` → 12k / 7.2k / 4.8k.
