# Project Entry Baseline (Opening Reduction)

**Status:** Wave — Agent 1 + Lead integration  
Legend: **CURRENT** | **NEW** | **RULE** | **LIMITATION**  
**Binding:** `docs/product/_WAVE-LEAD-CONTRACT.md`

## Purpose

Support mid-project onboarding: the real-world original contract may already be
partly “behind” the business before ProjectFlow management begins. That portion
must not inflate profitability, billing targets, or invent fake cash events.

## Formulas (**RULE** — locked)

```text
DISPLAY_ORIGINAL_NET − OPENING_REDUCTION_NET = MANAGED_OPENING_NET

PROJECTFLOW CURRENT CONTRACT (net)
  = MANAGED_OPENING_NET
  + approved change_order / adjustment events in the managed period

PROFITABILITY REVENUE BASIS = PROJECTFLOW CURRENT CONTRACT (net)
```

Same tax mode (`amountIncludesTax` + org applicable rule via
`computeTaxAmountBreakdown`) applies to display original and opening reduction.
Profitability remains **NET**. No hardcoded Israeli VAT.

## Storage mapping (**NEW**)

| Concept | Storage |
|---------|---------|
| Display original (context only) | `contracts.display_original_*` |
| Opening reduction (audit) | `contracts.opening_reduction_*` |
| Managed opening (engine) | existing `contracts.original_*` + `contract_value_events.kind='original'` |
| Current contract | sum of value events (unchanged) |

When reduction is `0` / omitted: display and reduction columns stay **NULL**
(= display equals managed). Behavior identical to **CURRENT** (today).

## Forbidden (**RULE**)

- No fake payment / billing / expense for the reduction amount
- Display original must **not** enter profitability, billing target, outstanding
  collection, or forecast margin KPIs
- Reduction is not a change order

## Lock (**RULE**)

`isOriginalContractAmountLocked` applies once `change_order` or `adjustment`
events exist. Managed opening **and** display/reduction cannot be silently
rewritten afterward — corrections use explicit adjustment events.

## UX (**NEW**)

Project create / details:

- Original contract amount (display)
- Optional “הפחתה לפני תחילת הניהול” / “Reduction before management started”
- Live managed-opening net preview via `formatMoney` (he-IL: `52,000 ₪`)

Header / overview surface display original vs managed / current for context
when a reduction exists — without changing KPI bases.

Financials **more info** / snapshot (**Lead**): when opening reduction exists,
show muted context rows for display original (and reduction). KPI tiles still
use managed opening → current contract only.

## Scenario A

- Display original 200k, reduction 150k → managed opening 50k
- Expense 10k → actual margin 40k
- Approved +20k change → current 70k
- No 150k payment / billing / expense row

## Scenario B

- Reduction 0 → storage and profitability identical to today

## Schema

Lead-owned migration `0019_project_job_modes_and_entry_baseline.sql`.
Do not edit `0000`–`0018`.

## LIMITATION

- Including-tax live preview without a resolved rate shows entered-unit
  difference (approximate) until the org tax rule is available client-side.
- Opening reduction is captured on the primary contract only (V1).
- **No backfill** — historical projects created before this wave have NULL
  display/reduction columns (treated as managed = display).
- **CRM convert-won-opportunity + reduction** — out of this wave; convert keeps
  reduction `0` / omitted (today’s path).
