# BOQ Overnight Wave — Lead Architecture Contract

**Status:** BINDING for all agents this wave  
**Lead owns:** migrations, shared permissions/modules, conflict resolution, final integration  
**Rules:** NO COMMIT · NO PUSH · NO apply to owner Supabase · portal stays OFF · ONE ECONOMIC TRUTH

---

## 1. What BOQ is / is not

**Is:** Optional measured-contract vertical: Bill of Quantities → physical progress → progress certificate → **existing** Billing / Retention / AR.

**Is not:** A second Actual engine, commitment engine, retention engine, tax invoicer, or public portal.

| Event | Creates Actual? | Creates Billing? | Creates Payment? |
|-------|-----------------|------------------|------------------|
| BOQ progress (measured/approved qty) | **NO** | NO | NO |
| Progress certificate → create billing draft | NO | **YES (draft)** via existing `createBillingRecord` | NO |
| Finalize billing | NO (revenue recognition via existing AR) | finalized | NO |
| Customer payment | NO | NO | YES (existing) |
| PO / Vendor bill | existing rules only | N/A | N/A |

---

## 2. Module + permissions

- Optional module key: `boq` (add to `OPTIONAL_MODULE_KEYS`)
- Permissions (catalog + migration seed + role templates):
  - `boq.read`
  - `boq.manage`
  - `boq.progress.submit`
  - `boq.progress.approve`
  - `boq.billing.create`
- Worker default: `boq.read` + `boq.progress.submit` only (no unit prices / contract values in field UX)
- Finance: read + billing.create (+ manage if useful)
- Manager/Owner: full set per templates
- Business profiles: GC + Renovation enable `boq`; trades leave auto/off; service/maintenance/architect-like leave off

---

## 3. Schema (migration `0032_boq_progress_billing`)

Lead-authored. Agents **must not** invent alternate tables.

| Table | Purpose |
|-------|---------|
| `project_boqs` | Versioned BOQ header per project (`draft`/`active`/`superseded`/`archived`) |
| `boq_nodes` | Hierarchy: `chapter` \| `item` with original + current qty/price/amount |
| `boq_change_allocations` | Approved CO → BOQ mapped or unallocated amount |
| `boq_progress_batches` | Measurement period/certificate batch |
| `boq_progress_lines` | Per-item measured/approved quantities for a batch |
| `boq_progress_billing_links` | Idempotent batch → `billing_records` (unique batch) |
| `boq_subcontractor_schedules` | Vendor engagement schedule header (cost rates — not client revenue) |
| `boq_subcontractor_schedule_lines` | Sub rate lines mapped to client BOQ items |
| `boq_subcontractor_valuations` | Sub measurement batches (draft vendor-bill proposal only) |
| `boq_subcontractor_valuation_lines` | Sub valuation quantities |

Money: `numeric(18,6)` string mode. Quantities: `numeric(18,6)`. Units: free `text` (suggested catalog in domain only).

---

## 4. Invariants (domain must enforce)

1. Only **one active** BOQ per project.
2. After `active`, original_* columns are immutable; changes go through `boq_change_allocations` + current_* recompute.
3. Pending Change Orders never write BOQ.
4. Cumulative approved qty cannot exceed **current** quantity (hard block) unless explicit deduction/correction path.
5. Cannot reduce current qty below already billed/approved cumulative without correction.
6. Same progress batch bills at most once (`boq_progress_billing_links` unique on batch_id).
7. Voided billing does **not** silently unlock rewrite of history — correction/supersede only.
8. Retention only via existing retention helpers on billing create.
9. Subcontractor rates never mix into client BOQ amounts.
10. Portal / public links: do not touch.

---

## 5. File ownership (do not collide)

| Agent | Owns |
|-------|------|
| Lead | `drizzle/**`, `docs/boq/*` contract, `shared/permissions`, `tenancy` module key + profiles, journal, integration fixes |
| A1 | `src/modules/boq/domain/**`, unit tests under `tests/unit/boq/**` |
| A2 | `src/modules/boq/ui/**` (BOQ editor/panels), project tab wiring, locales `boq` |
| A3 | Progress application + UI measurement flows under `boq/application/*progress*`, `boq/ui/*progress*` |
| A4 | Progress billing certificate → `createBillingRecord` integration |
| A5 | Change allocation application + CO hooks (call commercial public API only) |
| A6 | Mapping UI/domain for WP/cost/budget/procurement/sub schedules |
| A7 | Import kind `boq_items`, export, fixtures `tests/fixtures/boq/**` |
| A8 | Docs polish, e2e, command-center hooks, search, mobile field strip, audit action constants |
| Reviewers | Read-only findings → Lead fixes |

Shared: `src/modules/boq/data/boq.repository.ts` — Lead scaffolds; agents extend carefully (coordinate via Lead if conflict).

---

## 6. Billing integration shape

```text
approve progress batch
  → createProgressBilling(batchId, retentionPercent?)
  → assert not already linked
  → createBillingRecord({ projectId, netAmount: periodNet, retentionPercent, notes, lines from progress })
  → insert boq_progress_billing_links (unique batch)
  → mark batch status billed/locked
```

Extend `billing_lines` linkage optionally via notes/description + future `boq_progress_line_id` only if Lead adds column in 0032 — prefer description + link table to avoid editing frozen billing schema unless needed.

**Lead decision:** Do **not** alter `billing_records` / `billing_lines` columns in 0000–0031. Linkage is only `boq_progress_billing_links`. Certificate lines appear as billing line descriptions.

---

## 7. Mid-project opening

On BOQ / nodes:

- `opening_approved_quantity` — performed before ProjectFlow
- `opening_billed_quantity` — billed before ProjectFlow

These seed cumulative baselines; they do **not** invent historical `billing_records`.

---

## 8. Definition of ready (user-visible)

Project → כתב כמויות → create/import → activate → progress → approve → create progress bill → CO updates current → no double bill → no fake Actual.
