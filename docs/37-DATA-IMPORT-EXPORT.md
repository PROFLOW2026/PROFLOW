# 37 — Data Import, Migration & Export

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** basic export V1.x; structured import/migration V2  
**Class:** Core extension

---

## 1. Purpose

Plan safe movement of data into and out of ProjectFlow for onboarding, backup, analytics, and account portability.

---

## 2. Import (future)

Formats:

- CSV
- Excel

Entities (progressive):

- customers / clients
- employees
- vendors
- projects
- expenses
- historical transactions
- assets

### Import pipeline (conceptual)

```text
Upload file
  → validate schema
  → preview mapped rows
  → row-level errors/warnings
  → confirm
  → execute in transaction batches
  → result report
  → optional rollback window / compensating reversal
```

Validation must enforce tenant scope, referential integrity, MoneyValue currency, and permission checks.

---

## 3. Export

- CSV
- Excel
- PDF reports
- complete account export
- API export (`32`)

Exports respect authorization and confidentiality rules (`12`, `33`).

---

## 4. Migration concerns

- idempotent external keys where possible
- historical dates preserved
- do not invent ChangeOrders from messy legacy data without review
- map legacy “invoice” carefully to BillingRecord vs Document
- preview before commit is mandatory for financial imports

---

## 5. V1 impact

No full importer in V1.  
When implementation begins, keep entities export-friendly (stable IDs, clear enums). Basic CSV/PDF export may appear in V1.x.

---

## 6. Related documents

- Audit/integrity → `13`
- API platform → `32`
- Reporting → `29`
- Capability map → `19`
