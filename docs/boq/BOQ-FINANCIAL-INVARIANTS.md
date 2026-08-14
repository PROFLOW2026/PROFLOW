# BOQ Financial Invariants

Binding together with `LEAD-ARCHITECTURE-CONTRACT.md`.

## Event matrix

| Event | Creates Actual? | Creates Billing? | Creates Payment? |
|-------|-----------------|------------------|------------------|
| BOQ progress (measured / approved qty) | **NO** | NO | NO |
| Approved BOQ progress → canonical AR invoice | NO | **YES (finalized invoice)** in one BOQ billing operation | NO |
| Ordinary Billing finalization (`billing.manage`) | NO (revenue recognition via existing AR path) | finalized | NO |
| Customer payment | NO | NO | YES (existing) |
| PO / Vendor bill | existing AP rules only | N/A | N/A |

Approved BOQ progress billing is **not** a draft-then-later-finalize handoff. The released flow is:

```text
approved BOQ progress
  → create canonical AR invoice
  → finalize invoice
  → link finalized invoice to BOQ batch
  → mark BOQ batch billed
```

Create, finalize, link, and billed-status all happen inside the canonical BOQ progress-billing transaction. The BOQ link requires the invoice to already be finalized. Duplicate billing of the same batch is blocked.

## Core separations

1. **Progress ≠ Actual**

   Approved measured quantities never invent Actual cost. Actual remains expenses + labor + posted vendor bills from the financials engine.

2. **Billing ≠ Payment**

   Progress billing creates a finalized AR `billing_record` and links it to the BOQ batch. Cash collection is a separate payment event.

3. **VAT separate**

   BOQ period net equals AR subtotal (net). VAT (`tax_amount`) and invoice total stay on the AR record; they are not folded into BOQ net.

4. **Retention separate**

   Retention uses existing billing retention helpers as AR cash timing only. It does not reduce recognized net and is not a BOQ-local retention engine.

5. **One active BOQ per project**

   Enforced in schema + domain.

6. **Originals immutable after activate**

   Changes go through `boq_change_allocations` + `current_*` recompute. Pending COs never write BOQ.

7. **No double bill**

   `boq_progress_billing_links` unique on batch. Voided billing does not silently unlock history rewrite.

8. **Subcontractor rates are COST-only**

   Never folded into client BOQ `original_*` / `current_*` amounts.

9. **Portal disabled**

   Do not add public/portal BOQ surfaces.

## Subcontractor → AP proposal boundary

`createApBill` is **not** a safe explicit draft API: without a matching approval rule it inserts status `open` and can recognize Actual / consume PO commitment.

Therefore BOQ subcontractor valuations:

- Persist a durable valuation draft (`boq_subcontractor_valuations`)
- Surface UI note: **propose draft vendor bill manually** in AP
- Do **not** auto-call `createApBill` from BOQ

## Contextual comparison helper

`getBoqFinancialComparison` **reads** existing financials Actual / Forecast. It must never invent Actual from BOQ progress percentages.
