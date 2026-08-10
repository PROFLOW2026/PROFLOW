# Cost Allocation Model

**Status:** Wave 3 + partial-month micro-closure  
Legend: **CURRENT** | **FIXED** | **NEW MODEL** | **KNOWN LIMITATION**

## Classifications

DIRECT · SHARED · OVERHEAD (+ asset/capital labeling)

## Methods

manual_amount · manual_percent · contract_weight · labor_hours_weight · direct_cost_weight · equal_split (explicit only)

## Periodic proration

| Mode | Behavior |
|------|----------|
| `one_time` | Single slice = full period |
| `monthly` / `annual` / `custom` | Calendar-month slices clipped to period; NET split evenly across slices; residue on last slice |
| Per slice | Eligible projects overlapping the slice × driver × **active-day exposure** (see below) |

Invariant: `SUM(slices) = SUM(project allocations) = source NET`

Historical applied slices do not rewrite when contracts later change.

## Partial-month active-day exposure (**FIXED**)

Within each slice, compute inclusive **active days** = overlap of project calendar span with the slice.

| Driver | Policy |
|--------|--------|
| `contract_weight` | `effective = contractNet × (activeDays / sliceDays)` |
| `equal_split` | `effective = activeDays` (equal per active day, not per project head) |
| `labor_hours_weight` | **Inherent** — hours already queried for the slice window; do **not** multiply again |
| `direct_cost_weight` | **Inherent** — direct costs already queried for the slice window; do **not** multiply again |

Example (January 31 days, slice NET 2,000):

- Project A active 31/31, contract 1,000,000  
- Project B starts Jan 28 → active 4/31, contract 1,000,000  

Weights ∝ 1,000,000×1 and 1,000,000×(4/31) → A receives most of January’s 2,000; B receives a small share.  
SUM still equals 2,000 exactly (deterministic residue on last project id).

Date semantics: inclusive on both ends (`countInclusiveDays = daysBetween + 1`), consistent with project start/end overlap eligibility.

## Category policy

Configurable: family + default method + period behavior. Shown on expense capture; override allowed.

## Category period policy → expense schedule mode

| Category `default_period_behavior` (0016) | Expense `allocation_schedule_mode` (0017) |
|------------------------------------------|-------------------------------------------|
| `one_time` | `one_time` |
| `monthly` | `monthly` |
| `date_range` | `custom` (monthly windows inside the chosen range) |
| *(null)* | no category default — use expense explicit mode or `one_time` |
| — | `annual` is **expense-level only** (not in category vocabulary) |

No ambiguous mapping: every category value maps to exactly one schedule mode; `annual` is never produced from category policy.

## Integrity (0018)

| Rule | Enforcement |
|------|-------------|
| Applied/superseded snapshot columns immutable | DB trigger — only `applied → superseded` status change allowed |
| No silent DELETE of applied/superseded | DB trigger (cascade from expense delete still allowed) |
| Run org = expense org; line org = run org = project org | Composite FKs |
| One draft\|applied run per expense + slice | Partial unique index |
| One line per (run, project) | Unique index |
| Periodic fields consistent when `schedule_mode` set | CHECK |

## Migrations

`0014` allocation engine · `0015` ETC · `0016` category period policy · `0017` periodic schedule/slices · `0018` run integrity

## Project / job parity (entry-baseline wave)

Eligible set includes **projects and jobs** with overlapping active days.  
`contract_weight` **excludes** open-price jobs (`work_kind=job` + `pricing_mode=open`) — no invented contract. See `PROJECT-JOB-FINANCIAL-PARITY.md`.

## Simple owner summary

1. Annual/periodic costs are sliced by economic period (usually months).  
2. Projects/jobs active for only part of a slice receive only that time exposure (for calendar drivers).  
3. The selected allocation driver still determines relative distribution.  
4. Historical applied allocations remain frozen.
