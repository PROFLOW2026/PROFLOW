# Project / Job Financial Parity

**Status:** Wave entry-baseline + jobs  
**Owner:** Agent 3 (Financial parity) + Lead integration  
**Binding:** `docs/product/_WAVE-LEAD-CONTRACT.md`  
Legend: **CURRENT** | **NEW** | **RULE** | **LIMITATION**

---

## Architecture

**CURRENT** — One underlying entity: `projects` row.

| Field | Values | Meaning |
|-------|--------|---------|
| `work_kind` | `project` \| `job` | UX / filter label. Same financial engine. |
| `pricing_mode` | `fixed` \| `open` \| `NULL` | Jobs require fixed/open. Classic projects: NULL (= fixed when contracted). |

Do **not** create a second cost / commitment / profit subsystem for jobs.

**RULE** — `convertJobToProject` is allowed only when a managed revenue basis
already exists (fixed price / primary contract managed original net / CCV
`original` event). Open-price or contract-less jobs are blocked (Hebrew:
קבעו מחיר קבוע לפני המרה). After a successful convert: `work_kind=project` and
`pricing_mode=null` (classic semantics); fixed revenue remains on the
contract/events.

---

## Cost recognition (shared)

| Source | Treatment | Rule |
|--------|-----------|------|
| Direct expenses | Actual Cost 100% on that project/job | **CURRENT** |
| Labor | Actual Labor once (Mode B/C double-count protections unchanged) | **CURRENT** |
| PO → commitment | Committed, not Actual | **CURRENT** |
| Posted bill → actual | Actual; linked expense deduped | **CURRENT** |
| Vendor payment | Cash only — never Actual / Forecast Final | **CURRENT** |
| Billing / Payment | Separate from revenue basis | **CURRENT** |

---

## Overhead allocation

**NEW** — Eligible set includes **Projects AND Jobs** that overlap the allocation slice (active-day calendar unchanged).

| Driver | Jobs included? | Open-price jobs? |
|--------|----------------|------------------|
| `contract_weight` | Yes (fixed / classic) | **RULE: EXCLUDE** — no invented contract |
| `labor_hours_weight` | Yes | Yes (inherent hours in slice) |
| `direct_cost_weight` | Yes | Yes (inherent direct costs in slice) |
| `equal_split` | Yes | Yes (active-day basis) |
| `manual_*` | Explicit targets | Operator choice |

**RULE** — Periodic allocation (`allocation_runs` / slices): a job is eligible only for overlapping active days; applied snapshots stay immutable (0018).

**RULE** — Partial-month exposure unchanged: `contract_weight` / `equal_split` multiply by `activeDays / sliceDays`; labor / direct cost stay inherent.

**RULE** — Setting an open job to fixed price affects *future* allocation drafts that recompute eligibility. Already `applied` / superseded runs stay frozen. No forced re-run UX this wave.

---

## Open-price jobs (`work_kind=job` + `pricing_mode=open`)

**RULE**

```text
Revenue basis          = NOT AVAILABLE (do not invent 0)
Actual / Forecast cost = accumulate normally (expenses, labor, PO, ETC)
Actual / Forecast margin = NOT CLAIMED
contract_weight weight = EXCLUDED (use another driver or manual)
UI / KPI               = priceNotSet + "המחיר טרם נקבע" / "Price not set yet"
```

**FORBIDDEN** — Showing fake −loss from `revenue = 0 − cost`.

When pricing later becomes fixed (or a managed contract is set), profitability uses the existing revenue-basis formulas (entry baseline / current contract net).

---

## Forecast

| Mode | Cost forecast | Profit / margin |
|------|---------------|-----------------|
| Classic project / fixed job | **CURRENT** Forecast Final = Actual + Remaining Commitments + ETC | Revenue basis − Forecast Final |
| Open-price job | Same cost forecast | **NEW** — not claimed until revenue basis set |

---

## Org dashboard + reports

**NEW** — Work-kind filter: `all` | `project` | `job`.

| Filter | Includes |
|--------|----------|
| `all` | Every base-currency active project and job (**default**) |
| `project` | `work_kind=project` only |
| `job` | `work_kind=job` only |

**RULE** — Projects + Jobs partitions = All (no double count). Each entity appears once.

**RULE** — Unallocated organization costs remain visible beside rollup totals under every filter; they are never folded into project/job profit.

**RULE** — Open-price rows contribute costs to the filtered rollup; profit fields stay null and do not count as loss-making.

Wire: `getOrganizationProjectRollup({ workKindFilter })`, `getOrganizationReportsAnalytics`, `getHomeDashboard`.  
UI chrome: home + reports accept `?workKind=` with Hebrew labels הכל / פרויקטים / עבודות (`WorkKindFilterChrome`).

---

## Job list actual / profit

**NEW** — `listJobsForOrg` uses `loadProjectFinancialsBatch` (shared compose) for
actual cost and actual profit — same recognition path as project financials /
org rollup (expenses, labor, AP, allocated overhead). Not a second cost engine.

---

## Compose / KPI presentation

**NEW** — `ProjectFinancials` carries:

- `workKind`, `pricingMode`, `priceNotSet`
- `priceNotSet` when `pricing_mode=open` **or** (job without managed primary
  contract). Classic projects are not gated solely by missing contract.
- `profit = null` when `priceNotSet` (even if `project_profit.read`)
- KPI resolver nulls margins / contract display when `priceNotSet`
- Panel shows `kpis.priceNotSet` (he-IL: **המחיר טרם נקבע**); open-job
  Financials tab mounts the real KPI panel (costs visible, margins gated)
- When opening reduction exists: muted `displayOriginalContractValue` /
  `openingReductionValue` on financials more-info / snapshot (context only)

---

## Tests

| Scenario | Coverage |
|----------|----------|
| **E** | Mixed 2 projects + 8 jobs; All/Projects/Jobs partition; open-price cost OK / profit gated |
| **F** | Overhead across projects+jobs; short job active-day exposure; open-price excluded from `contract_weight` |

---

## Limitations

**LIMITATION** — Org cash-flow / AR aging are not yet work-kind filtered (remain org-wide disclosures).

**LIMITATION** — Setting an open-price job to fixed (and creating managed opening) is owned by Agents 1/2 via `setJobFixedPrice`; this module consumes `pricing_mode` / commercial events once set. Converting open-price → project is blocked until a managed revenue basis exists.

**LIMITATION** — Expense/procurement pickers default to all work kinds this wave; optional filter chrome later.
