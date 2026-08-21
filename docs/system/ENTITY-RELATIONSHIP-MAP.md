# Entity / Business Relationship Map — Post Refinement

**Parent:** [`MASTER-CAPABILITY-MAP.md`](./MASTER-CAPABILITY-MAP.md)  
**Updated:** 2026-08-21 (pre-Owner SQL closure)  
**Owner SQL:** 0060–0061 **NOT APPLIED**

## Commercial spine

```text
Org default payment term (default_payment_term_key → catalog entry)
  ↓
Client (+ type, default payment term)
  → Project/Job/Work Order
    → Contract (+ payment_term_id override) → Value Events → CCV
    → Change Request → Commercial quote → CO → CCV
    → BOQ → Progress → Billing (+ payment_term_id override) (≠ Payment)
    → Budget lines (+ cost_code_id) ─┐
    → Expenses (+ allocation cost_code_id) ─┼→ Cost-code variance: Budget | Committed | Actual
    → Labor / AP Actual (NET) → Profit (VAT out)
```

**AR payment terms:** billing explicit → contract → client default → org default.

## Sales spine (cleaned)

```text
Prospect → Lead (+ lead_source catalog)
  → Opportunity (+ lost_reason catalog)
    → Product Quote (/quotes)  ← customer commercial truth
    → Accepted → Convert → Client + Project|Job|WorkOrder + Opening Contract
CRM sales quotes: legacy read-only; new creation deprecated
```

## Vendor spine

```text
Org default payment term
  ↓
Vendor (type + categories + specialties + identifiers + default payment term)
  → Engagements (roster ≠ cost; optional engagement_role)
  → Subcontract (+ payment_term_id override; type must be subcontractor|both)
  → PO (+ payment_term_id override) → Commitment (≠ Actual; PO lines + cost_code_id)
  → AP Bill (+ payment_term_id override, line cost_code_id, allocations, match) → Payment (cash only)
  → Documents / Compliance / Requirements
```

**AP payment terms:** bill explicit → **subcontract** → PO → vendor default → org default. Subcontract wins when both subcontract and PO are linked.

## Cost code attribution chain

```text
organization_catalog_entries (kind=cost_code)
  → project_budget_lines.cost_code_id     → Budget slice
  → purchase_order_lines.cost_code_id     → Committed slice
  → expense_allocations.cost_code_id      → Actual slice (recognized expenses)
  → ap_bill_lines.cost_code_id            → Actual slice (recognized AP)
```

Cost Category on expense allocations is separate and excluded from cost-code variance.

## Field day spine

```text
Daily Log
  → linked Vendors / Employees / Assets (tables)
  → free-text fields retained for legacy
  → Safety / Forms / Documents
  ≠ Actual cost
```

## Ops → finance bridge (0061)

```text
Material / Equipment usage record
  → ops_expense_link (kind: material_usage_record | equipment_usage_record)
  → Expense DRAFT only (never auto Actual; user must finalize)
```

## Approvals

```text
approval_rules (+ ordered approval_rule_steps — editable template)
  → submit → approval_requests (+ approval_request_steps — immutable snapshots)
  covers: expense, vendor_bill, PO, vendor_credit, time_correction, quote_discount, budget_revision
Domain-native: Changes, BOQ progress, Timesheet approve/lock
```

Rule step edits affect **future** submits only. In-flight requests retain the approver config copied at submit time; only step `status` / decision fields change.

## Portal

Public customer/vendor portal routes exist but **`isExternalPublicAccessEnabled()` = false** — login and access hard-disabled. Admin grant foundation retained; no external financial mutation.
