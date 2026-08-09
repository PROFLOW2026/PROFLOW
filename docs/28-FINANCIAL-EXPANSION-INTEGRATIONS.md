# 28 — Financial Expansion & Accounting Integrations

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** deeper AR/cash V2; AP/PO matching V3; connectors V2–Later  
**Class:** Core extension + Integrations  
**Hard rule:** ProjectFlow does **not** have to become the statutory accounting ledger

---

## 1. Purpose

Deepen receivables, payables, cash forecasting, and accounting connectivity on top of V1’s basic billing/payment/outstanding separation.

---

## 2. Starting point from V1

V1 already preserves:

- Contract Value
- Invoiced (basic BillingRecord)
- Paid
- Outstanding
- Actual Cost / overhead allocation (simple)
- no accounting-grade Revenue Recognition labeling

This file plans expansion, not replacement.

---

## 3. Accounts Receivable (future depth)

- full invoice lifecycle
- payment applications
- installments
- milestones
- aging
- credit notes
- adjustments
- collections workflows
- retention / holdback

BillingRecord can evolve or specialize into richer AR documents without abandoning the V1 concept.

---

## 4. Accounts Payable (future depth)

- vendor invoices
- approval
- due dates
- payments
- subcontractor claims
- retention
- matching to PO (`21`)

AP actuals remain distinct from PO commitments.

---

## 5. Cash flow

- expected inflows (approved billing schedules, forecast collections)
- expected outflows (AP, payroll estimates, PO due dates, overhead)
- project cash curve
- business cash forecast

Cash forecasts are analytical; they must not overwrite ledgers.

---

## 6. Accounting integrations

ProjectFlow remains operational/project-economics system of record for projects.  
Statutory books may live in external accounting systems.

### Architecture concepts

| Concept | Meaning |
|---------|---------|
| **AccountingConnector** | Provider adapter |
| **ExternalAccountingId** | Mapping to remote entity |
| **SyncState** | pending/synced/error |
| **SyncError** | Retryable failure detail |
| **AccountingMapping** | Tax/account/category maps |
| Import/Export jobs | Bulk exchange |
| Duplicate protection | Idempotency keys |

### Example targets (non-commitment)

- Israeli accounting platforms (examples only)
- QuickBooks
- Xero
- other regional ledgers

No provider is selected here.

---

## 7. Separation from SaaS billing

Customer project AR/AP ≠ ProjectFlow subscription billing (`38`).

---

## 8. V1 impact

**No change beyond already-decided basic billing/payments.**  
Do not build full AR/AP/retention in V1.

---

## 9. Related documents

- Financial model → `04`
- V1 scope → `16`
- Procurement → `21`
- API platform → `32`
- SaaS billing → `38`
- Capability map → `19`
