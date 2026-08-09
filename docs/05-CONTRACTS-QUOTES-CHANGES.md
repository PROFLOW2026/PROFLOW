# 05 — Contracts, Quotes & Changes

**Status:** Draft with owner decisions applied  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Define the commercial change lifecycle: original contract value, quotes, versions, change requests, change orders, approvals, additions, and reductions.

This is a **central module** of ProjectFlow.

---

## 2. Why this matters

In project businesses, profitability often dies in unmanaged extras:

- work done before approval
- approvals without billing
- verbal changes with no version history
- reductions not reflected in forecasts

ProjectFlow must make change control visible and historically trustworthy.

---

## 3. Contract value components

| Component | Meaning |
|-----------|---------|
| **Original Contract Value** | Starting agreed value |
| **Approved Additions** | Positive approved Change Orders |
| **Approved Reductions** | Negative approved Change Orders |
| **Current Contract Value** | Original + additions − reductions |
| **Pending Changes** | Change Requests / quotes not yet approved as Change Orders |
| **Total Potential** | Current + pending (label carefully in UI) |

### Example

```text
Original Contract Value = 500,000
Approved addition       = +12,000   (Change Order)
Approved reduction      = -8,000    (Change Order)
Current Contract Value  = 504,000
Pending Change Request  = +18,000
Potential if approved   = 522,000
```

**Rule:** Changing the current commercial reality must not erase prior values/history.

---

## 4. Quotes

### Meaning

A priced commercial offer. May relate to:

- initial project proposal
- a change request
- an optional alternate scope

### Versioning (mandatory concept)

Example:

- V1 = 18,000
- V2 = 15,700
- V2 approved

Rules:

- Do not delete V1
- Versions are immutable after issuance/send (exact immutability point TBD)
- One version may be marked selected/approved

### Quote contents (conceptual)

- Parent object (project / change request)
- Version number
- Line items
- Pricing model references
- Tax treatment
- Validity dates
- Status
- Documents/PDF
- Notes / assumptions / exclusions

---

## 5. Change Request (canonical)

### Meaning (decided)

**ChangeRequest** = request / pricing / negotiation workflow.

A new request is **not** immediately a contract value change.

### V1 visible commercial lifecycle (DECIDED 2026-08-09 — C2 / U7)

```text
Draft
  → Awaiting Approval
  → Approved  → creates/links ChangeOrder (affects Current Contract Value)
  → Rejected
  → Cancelled
```

### Notes

- **`Sent` is an event** (`sent_at` / evidence), not a required lifecycle status.
- Operational In Progress / Completed are **not** primary V1 commercial statuses.
- Billing state is separate: unbilled / partially billed (if supported) / billed.
- Payment remains separate.
- Full aspirational chain (pricing → invoiced → paid as one status field) is rejected for V1 to avoid mixing negotiation, execution, billing, and cash.

---

## 6. Change Order (canonical)

### Meaning (decided 2026-08-09)

**ChangeOrder** = approved commercial change that **affects contract value**.

### Rules

- ChangeRequest and ChangeOrder remain **separate canonical concepts**
- Only approved Change Orders update Current Contract Value
- Additions and reductions are first-class
- A Change Order may originate from an approved Change Request + selected Quote Version
- Historical Change Orders are not deleted when newer changes arrive

### V1 UX note

The UI may present CR → pricing → approval → CO as **one seamless workflow**, while keeping distinct records underneath.

---

## 7. Additions and reductions

A change can be:

- positive (`+12,000`)
- negative (`-8,000`)

Negative changes are first-class, not “notes”.

A single Change Request / resulting Change Order may affect **multiple work packages / domains**.

Example:

One client request impacts Electrical and HVAC packages with separate cost/price lines, one commercial approval package.

---

## 8. Approvals

### Approval needs (conceptual)

- Internal approval (sales/PM/owner)
- Client approval
- Possibly financial approval thresholds later

### Approval record should capture

- who
- when
- what version
- decision
- comment
- related document (signed quote/CO, etc.)

Future: e-signature integrations. Not required for model foundation.

Client-side approval method for V1 remains **OPEN** (`C3`).

---

## 9. Relationship to billing

Approved Change Order ≠ invoiced amount.

The system must support states such as:

- approved but not started
- done but not invoiced
- invoiced but not paid

V1 includes **basic outgoing billing/payment tracking** linked to project and optionally to change/commercial context.  
See `04-FINANCIAL-MODEL.md` and `16-V1-SCOPE.md`.

Preserve:

- Contract Value
- Invoiced
- Paid
- Outstanding

---

## 10. Contract documents

Contracts and quotes are document-aware:

- original signed contract
- appendices
- drawings referenced by quote
- client approval messages/files
- change order PDFs
- external client invoices attached to billing records

See `09-DOCUMENTS-EXPENSE-CAPTURE.md`.

---

## 11. Pricing models on quotes/contracts

Eventually support mixed models (fixed + unit + hourly, etc.).  
V1 may start with:

- fixed total
- simple line items
- optional hourly allowances

Advanced quantity/unit libraries can wait.

---

## 12. Historical integrity rules

1. Do not overwrite original contract value.
2. Do not delete prior quote versions.
3. Approved values change through explicit Change Orders.
4. Tax/rate updates do not rewrite issued quotes/billing snapshots.
5. Audit every commercially meaningful transition.
6. Do not collapse ChangeRequest into ChangeOrder in the data model.

---

## 13. V1 commercial slice (updated)

In V1:

- original contract value on project
- Change Requests with workflow statuses (subset TBD)
- quote versions on a change
- Change Orders for approved commercial effect
- approved additions/reductions affecting Current Contract Value
- pending vs approved visibility
- basic links to outgoing billing records / payments / outstanding

Deferred:

- complex multi-party approval matrices
- customer portal for self-approval
- full e-sign
- highly configurable workflow builder
- statutory invoice issuance suite

---

## 14. Related documents

- Financial model → `04-FINANCIAL-MODEL.md`
- Projects/packages → `03-BUSINESS-PROJECT-MODEL.md`
- Audit → `13-AUDIT-HISTORY-DATA-INTEGRITY.md`
- V1 scope → `16-V1-SCOPE.md`
- Open questions → `18-OPEN-QUESTIONS.md`
