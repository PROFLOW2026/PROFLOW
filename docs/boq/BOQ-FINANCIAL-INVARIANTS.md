# BOQ Financial Invariants

Binding together with `LEAD-ARCHITECTURE-CONTRACT.md`.

## Event matrix

| Event | Creates Actual? | Creates Billing? | Creates Payment? |
|-------|-----------------|------------------|------------------|
| BOQ progress (measured / approved qty) | **NO** | NO | NO |
| Progress certificate → billing draft | NO | **YES (draft)** via existing `createBillingRecord` | NO |
| Finalize billing | NO (revenue recognition via existing AR path) | finalized | NO |
| Customer payment | NO | NO | YES (existing) |
| PO / Vendor bill | existing AP rules only | N/A | N/A |

## Core separations

1. **Progress ≠ Actual**  
   Approved measured quantities never invent Actual cost. Actual remains expenses + labor + posted vendor bills from the financials engine.

2. **Billing ≠ Payment**  
   Progress billing creates / links `billing_records`. Cash collection is a separate payment event.

3. **Retention reused**  
   Retention only via existing retention helpers on billing create — no BOQ-local retention engine.

4. **One active BOQ per project**  
   Enforced in schema + domain.

5. **Originals immutable after activate**  
   Changes go through `boq_change_allocations` + `current_*` recompute. Pending COs never write BOQ.

6. **No double bill**  
   `boq_progress_billing_links` unique on batch. Voided billing does not silently unlock history rewrite.

7. **Subcontractor rates are COST-only**  
   Never folded into client BOQ `original_*` / `current_*` amounts.

8. **Portal disabled**  
   Do not add public/portal BOQ surfaces.

## Subcontractor → AP proposal boundary

`createApBill` is **not** a safe explicit draft API: without a matching approval rule it inserts status `open` and can recognize Actual / consume PO commitment.

Therefore BOQ subcontractor valuations:

- Persist a durable valuation draft (`boq_subcontractor_valuations`)
- Surface UI note: **propose draft vendor bill manually** in AP
- Do **not** auto-call `createApBill` from BOQ

## Contextual comparison helper

`getBoqFinancialComparison` **reads** existing financials Actual / Forecast. It must never invent Actual from BOQ progress percentages.
