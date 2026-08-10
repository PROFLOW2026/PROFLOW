# Master Wave — Lead Domain Skeleton (pre-integration)

**Status:** DRAFT until Agents 1–7 return  
**0021 applied:** NO  
**0000–0020:** IMMUTABLE  

## Confirmed contact FK fix ([Contact FK](9772e719-6957-4576-8830-8ad0afbb603f) = BLOCKER confirmed)

Composite `ON DELETE SET NULL` on `(primary_contact_id, organization_id)` is unsafe in PostgreSQL (would null `organization_id`).

**Lead decision (LOCKED — Agent 6):**
- `projects.primary_contact_id` → `client_contacts(id)` **simple FK** `ON DELETE SET NULL`
- Same-org + client-match remain in `app.projects_primary_contact_client_guard` (and app assert)
- Optional: `BEFORE DELETE` on `client_contacts` clearing only `projects.primary_contact_id`
- Exact SQL: `docs/product/_MASTER-WAVE-AGENT6-CONTACT-FK.md`
- Must ship in redesigned 0021 before any apply

## Compensation (LOCKED — [Compensation](b120442d-4252-4f35-b316-38c2aebcd3d0))

- **Extend `rate_versions`** as CompensationVersion (keep FKs from time entries) — no parallel day-ranged compensation table
- Optional **`employee_employer_cost_months`** for estimated/actual month facts (immutable when actual) — merge naming with Agent 3 `employee_month_costs` in final 0021
- `base_rate` = gross/base; `rate_unit` = employment basis; burden = user estimate only (no ×1.25, no payroll net)
- Closed/applied month Actual uses Displacement (Agent 3) — month actual must not stack on Mode C snapshots


| Concept | Role | Creates Actual? |
|---------|------|-----------------|
| Employee master | Identity/costing entity | NO |
| Compensation history | Effective-dated employer cost basis | NO (until recognized period) |
| Project assignment | Temporal association + optional plan % | **NO** |
| Time entry | Activity evidence; may snapshot rate-based cost | YES (existing Mode C) until reconciled |
| Monthly employer cost period | One economic amount for month | Authoritative when closed |
| Cost allocation lines | Distribute period cost → projects + unallocated | YES (replaces/reconciles Mode C for that period) |
| Vendor | Party | NO |
| Vendor bill | Recognized cost | YES (existing) |
| Bill project allocations | Split bill across projects | Attribution only — no second Actual |
| Vendor payment | Cash | **NO** |

## Double-count invariant (LOCKED — [Monthly alloc](d3bd7bd9-0fc0-46a6-8b9f-7e8e701a97ce))

**Displacement model** (not delta-on-top of time snapshots):

```
For enabled monthly regime, each (employee, calendar_month):
  draft / feature off → Actual = Σ time_entries.cost_amount (existing Mode C)
  applied/closed      → Actual = MONTHLY_ALLOCATED lines ONLY
                        time cost_amount = basis/audit, NOT added again

known_employer_cost = Σ project allocation lines + VISIBLE_UNALLOCATED
```

Assignment never creates Actual. Remainder never silently dumped onto projects.

`known_amount` source: Agent 1 compensation (estimated/actual) or manual entry until compensation lands.

## Vendor bill split (LOCKED — [Vendor alloc](9473ec8e-3d8d-4e80-8c0b-8890772a6ce2))

- Child `ap_bill_project_allocations`; keep simple `ap_bills.project_id`
- If allocation rows exist → rollup uses **lines only** (never header + lines)
- Payment remains cash-only (not Actual)
- Partial remainder = visible Unallocated Vendor Costs

## 0021 target filename (Lead)

`0021_workforce_contacts_and_allocations.sql`

### Likely include now
1. Project contact column + **safe** FK + trigger (keep product)
2. Temporal `employee_project_assignments` (replace static `project_team_members`)
3. Compensation period / employer-cost history tables (if Agent 1 confirms gaps vs rate_versions)
4. Monthly workforce cost periods + allocation lines (minimal for invariant)
5. `ap_bill_project_allocations` (if Agent 4 confirms needed now)

### Explicitly defer
- Full attendance/time-clock tables
- Payroll/net/tax engines
- Forced setup wizards

## Optionality

Org with zero compensation rows, zero assignments, zero workforce/vendor allocations must behave as today (expenses/billing/jobs/projects/time optional).

## Attendance hook

Assignments and time entries remain date-based; non-project time codes already exist. Do not add attendance tables in 0021 unless trivially required — keep compatible (presence ≠ project work later).
