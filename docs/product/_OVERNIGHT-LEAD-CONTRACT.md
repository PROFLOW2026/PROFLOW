# Overnight Product Completion Wave — Lead Contract

**Status:** BINDING  
**Release tonight:** NO  
**Commit / push / PR / Supabase migrate:** FORBIDDEN  

## Immutable

- Migrations `0000`–`0019` (including `0019_project_job_modes_and_entry_baseline`) — never edit
- Existing financial engine formulas (Actual / Commitment / ETC / Forecast / open-price gate / opening reduction)
- Do not run `db:migrate`, drizzle-kit push, or SQL against owner Supabase

## Lead-owned surfaces (agents must NOT edit)

- `drizzle/migrations/**` and `drizzle/migrations/meta/_journal.json`
- `drizzle/schema/**` (unless Lead later assigns a specific new file)
- `src/shared/permissions/catalog.ts`
- `src/components/shell/navigation.ts` / `app-shell.tsx` (nav wiring)
- `src/shared/i18n/config.ts` (MESSAGE_NAMESPACES merge) — agents add locale JSON files; Lead wires namespaces
- Shared compose/profit formulas under `src/modules/financials/application/compose-*` and `domain/profit*` except narrow extension hooks Lead documents

## Agent file ownership (no overlap)

| Agent | Owns (prefer new files under) | Must not touch |
|-------|-------------------------------|----------------|
| **1** Vendor payments / AP | `src/modules/ap/**` (payments domain), AP UI under `src/app/**/procurement/ap/**`, AP tests | Billing customer payments, OCR, bank, portal |
| **2** OCR | `src/modules/ocr/**`, OCR review UI routes | AP payments, bank, portal |
| **3** Bank / reconciliation | NEW `src/modules/banking/**` (or `reconciliation/**`), settings/banking UI | AP payment math ownership, OCR |
| **4** External invoicing | NEW `src/modules/invoicing-integration/**` (name flexible), billing bridge hooks via adapter only | Do not issue statutory docs locally |
| **5** Portals | `src/modules/portal/**`, portal routes | Internal financial compose |
| **6** Planning / Gantt | NEW `src/modules/planning/**`, project planning UI (projects only; jobs opt-out) | Jobs forced complexity |
| **7** Ops→Finance bridges | Assets/compliance/maintenance link application + UI; expense draft creation calls | Inventory auto-accounting |
| **8** Offline field | `src/modules/offline/**`, SW/PWA field capture hardening | Full-app offline cache |

## Schema protocol

Each agent appends a `SCHEMA_REQUEST.md` under their module (or returns in final report):

```text
TABLE / COLUMN / INDEX / CHECK / RLS
Why
FK + same-org integrity needs
```

Lead designs additive `0020+` after all reports. Agents may use domain types + repository interfaces + in-memory/test doubles until schema lands.

## Financial non-negotiables (every agent)

- Vendor Payment ≠ Actual Cost  
- Customer Payment ≠ Actual Cost  
- Vendor Bill recognition remains the Actual path for vendor cost  
- Billing ≠ Payment  
- VAT ≠ Profit; NET profitability  
- Open-price jobs: never fake `0 − cost` loss  
- Opening reduction is never bill/payment/expense/CO  
- No silent finalized financial writes from OCR/bank/ops links  

## Delivery format (every agent → Lead)

```
STATUS = COMPLETE | PARTIAL | BLOCKED
Files changed
Schema changes required
New permissions required
New translations required
Tests added / passed
Known limitations
BLOCKER / HIGH / MEDIUM
External credentials required
```

NO COMMIT. NO PUSH.
