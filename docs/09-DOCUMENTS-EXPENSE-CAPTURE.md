# 09 — Documents & Expense Capture

**Status:** Draft with owner decisions applied  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Define document-awareness, file storage separation, invoice/expense capture, split allocation (including overhead), basic outgoing billing attachments, and future OCR/AI readiness.

---

## 2. Document-aware from day one

ProjectFlow must treat files as first-class business objects, not afterthought attachments.

### Example document types

- invoices (incoming supplier / outgoing client copies)
- receipts
- contracts
- quotes
- change order PDFs
- plans / drawings
- insurance policies
- photos
- certificates / approvals
- supplier documents
- employee documents
- PDFs and common office formats

---

## 3. Storage vs metadata

### Rule (preferred architecture direction)

```text
Database = metadata + relationships + permissions + extraction fields
File Storage = binary objects
```

Never rely on database BLOBs as the long-term strategy for all files.  
Exact storage vendor remains OPEN until pre-implementation stack review.

### Document metadata (conceptual)

- organization_id
- storage pointer
- filename / content type / size
- checksum
- document type
- uploaded by / at
- status (available, processing, archived)
- soft-delete markers
- optional capture job link

### Document links

A document can link to multiple contexts:

Examples:

- one supplier invoice linked to Vendor + Expense + Project A + Project B (via allocation) + Overhead portion
- external client invoice PDF linked to BillingRecord + Project (+ ChangeOrder if relevant)
- insurance PDF linked to Vendor and Project
- site photo linked to Project and Work Package and Change Request

---

## 4. Secure file access

Files must obey tenant isolation and authorization.

Principles:

- no public guessable URLs as the only protection
- time-limited access links or mediated download
- permission checks before read/write
- audit sensitive downloads if needed later

Details: `15-SECURITY-MULTITENANCY.md`.

---

## 5. Expense capture flow (product intent)

### Fast simple flow (progressive complexity — preferred default UX)

```text
+ Expense
→ amount
→ optional description
→ optional project
→ optional supplier (none | plain name | existing Vendor)
→ save
```

Currency/tax defaults may come from country/org settings where safe.  
Do **not** require Vendor creation, document upload, allocation, or full accounting fields to save.

### Optional enrichment (same record, later or “More details”)

- upload invoice/photo
- tax details
- category / cost family
- WorkPackage (defaults to project Default/General package)
- promote supplier name → Vendor / link Vendor
- split allocation
- payment details
- notes

### Near-term document-assisted flow (no OCR required)

1. User uploads photo/PDF (optional)
2. User enters amounts; supplier optional as name or Vendor
3. User optionally assigns project/work package and/or overhead / non-project
4. Optional splits across projects and overhead
5. Document stored and linked when provided
6. Expense becomes part of project and/or business cost truth

### Future OCR/AI flow

```text
Phone photo
  → upload
  → OCR/AI CaptureJob
  → proposed fields:
      supplier, document number, date,
      amounts, tax, line items, payment method,
      suggested project/category/overhead
  → human confirm/edit
  → create expense + links
```

OCR is **not** V1-critical. Data model must allow CaptureJob / Extraction objects later.

---

## 6. Expense splitting (V1-critical)

One invoice/expense may be split across:

- multiple projects
- multiple work packages
- multiple categories
- mix of direct, shared, overhead, and asset/capital categorization

### Example

```text
Invoice total 10,000
  60% Project A / Electrical (Direct)
  30% Project B / HVAC (Direct)
  10% Business Overhead / Tools
```

Allocation lines must sum to the document total according to validation rules (gross/net basis TBD).

Recurring general business expenses (rent, software, etc.) are in V1 scope even when not attached to a single project.

---

## 7. Outgoing billing documents (V1 basic)

V1 is not statutory invoice issuance software, but billing records can attach an **external** invoice/document.

Typical link:

```text
BillingRecord (amount, date, status, project/change)
  ↔ Document (client invoice PDF / scan)
  ↔ Payments
  → Outstanding
```

Preserve separation: Contract Value / Invoiced / Paid / Outstanding.

---

## 8. Incoming vs outgoing documents

Distinguish:

| Direction | Examples |
|-----------|----------|
| Incoming | supplier invoice, subcontractor claim, receipt |
| Outgoing | client invoice copy, quote PDF, contract send-out |
| Neutral / other | photos, plans, internal docs |

Do not overload one “Invoice” concept for both AP and AR without clear direction fields.

---

## 9. Photos from the field

Photos are operationally critical in construction:

- progress evidence
- defect documentation
- change request support
- safety/events

They should be easy to capture on mobile and attach to project structures quickly.

---

## 10. Retention and archival

Documents related to contracts, taxes, and insurance may have long retention needs.

Policy questions remain open:

- retention duration defaults by country pack
- legal hold
- hard delete eligibility

See `13-AUDIT-HISTORY-DATA-INTEGRITY.md`.

---

## 11. V1 scope (updated)

Must have:

- fast expense capture with minimal required fields
- supplier plain name **or** Vendor link (Vendor not required)
- upload files (optional on expense)
- attach to project/client/vendor/expense/change request/change order/billing record
- basic types
- permissioned access
- expense with optional document and split lines (including overhead)
- attach external documents to basic outgoing billing records
- progressive disclosure (basic vs advanced fields)

Defer:

- OCR/AI extraction
- automatic supplier matching
- advanced statutory PDF generation suite
- full DMS features like complex folder trees

---

## 12. Related documents

- Financial expenses → `04-FINANCIAL-MODEL.md`
- Contracts/changes → `05-CONTRACTS-QUOTES-CHANGES.md`
- Security/file access → `15-SECURITY-MULTITENANCY.md`
- V1 scope → `16-V1-SCOPE.md`
- Roadmap OCR → `17-FUTURE-ROADMAP.md`
- Tech storage options → `14-TECHNICAL-ARCHITECTURE-OPTIONS.md`
