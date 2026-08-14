# BOQ Architecture

**Status:** Aligns with `LEAD-ARCHITECTURE-CONTRACT.md`  
**Module:** optional `boq`  
**Portal:** OFF — do not expose BOQ via public/portal surfaces.

## What BOQ is

Bill of Quantities is an optional measured-contract vertical:

```text
BOQ baseline → physical progress → progress certificate → existing Billing / Retention / AR
```

It is **not** a second Actual engine, commitment engine, retention engine, tax invoicer, or portal.

## Module layout

| Layer | Path | Responsibility |
|-------|------|----------------|
| Schema | `drizzle/schema/boq.ts` + migration `0032` | Tables Lead-owned |
| Domain | `src/modules/boq/domain/**` | Amounts, lifecycle, reconciliation, certificate math |
| Application | `src/modules/boq/application/**` | Manage BOQ, progress, billing, change allocation, sub schedules, mappings |
| Data | `src/modules/boq/data/boq.repository.ts` | Org-scoped persistence |
| UI | `src/modules/boq/ui/**` | Project tab panel, progress forms, mappings, subcontractor schedule |
| Docs | `docs/boq/**` | Contract + invariants + lifecycle |

## Permissions

- `boq.read` — view BOQ / progress (no portal)
- `boq.manage` — baseline, items, mappings, sub schedules
- `boq.progress.submit` — measurement drafts
- `boq.progress.approve` — approve batches
- `boq.billing.create` — progress bill via existing `createBillingRecord`

Worker default: read + progress.submit only (field UX hides unit prices / contract values).

## Related mappings

`boq_nodes` may link `workPackageId`, `costCategoryId`, `budgetLineId` for control/reporting. Mapping updates never rewrite `original_*` / `current_*` money columns.

## Subcontractor foundation

`boq_subcontractor_*` stores **COST** rates mapped to client BOQ items. Rates must never mix into client BOQ revenue amounts. Valuations stop at durable drafts; vendor bills are proposed manually in AP (see financial invariants).

## Search

Global search indexes BOQ item codes / descriptions behind `boq.read`. Results never include unit prices or Actual figures.

## Command Center / Today

Deterministic actions (WHAT / WHY / WHERE / ACTION href):

1. Measurement awaiting approval (`draft` progress batch)
2. Progress ready to bill (`approved` + no billing link)
3. BOQ vs contract mismatch (reconciliation status ≠ matched)

Portal stays OFF.
