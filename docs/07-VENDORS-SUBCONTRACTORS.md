# 07 — Vendors & Subcontractors

**Status:** Draft with progressive-complexity direction  
**Phase:** Planning only  
**Owner note:** Vendor registry is optional to use; expenses must not require Vendor creation (`39`)

---

## 1. Purpose

Define external parties that supply materials or perform work as first-class entities **when the organization needs structured vendor history** — while allowing lightweight supplier capture on expenses first.

---

## 2. Core idea

A structured **Vendor** can hold history:

- company profile
- domains/capabilities
- contracts
- quotes
- invoices
- payments
- documents
- insurance
- project participation
- cost and balance history

### Progressive complexity (DECIDED posture)

An expense line alone **is enough to start**.

Users must **not** be forced to create a Vendor entity before recording an expense/invoice cost.

Expense/supplier relationship modes:

1. No supplier specified  
2. Supplier name as plain information  
3. Existing Vendor linked  
4. New Vendor created from the transaction  

Upgrade path without data loss:

```text
Expense + supplier_name "ABC Electrical Supplies"
  → optional “Save / link as Vendor?”
  → Vendor created/linked
  → historical Expense remains valid
```

---

## 3. Vendor concept

### Working term: Vendor

Covers:

- Subcontractors
- Suppliers / material vendors
- Mixed companies that both supply and install
- Professional external consultants hired as vendors

### Type flags (conceptual)

A vendor may be tagged as one or more:

- Subcontractor
- Supplier
- Service provider
- Other

Avoid forcing a single rigid subtype if real companies mix roles.

---

## 4. Vendor profile data (conceptual)

- Legal name / display name
- Contacts
- Addresses
- Tax identifiers (country-pack dependent)
- Profession domains
- Service types
- Internal rating/notes
- Status (active/inactive/blocked)
- Default payment terms
- Documents
- Insurance links
- Bank/payment details (sensitive; permissioned)

---

## 5. Project engagement

A vendor becomes related to delivery through engagements:

```text
Vendor → VendorEngagement → Project / WorkPackage
```

Engagement may include:

- scope description
- commercial terms
- quoted value
- contracted value
- delivery mode role
- schedule refs
- status
- linked documents
- linked costs/invoices/payments

---

## 6. Hierarchies

Construction reality:

```text
Client
  → Main contractor
    → Subcontractor
      → Lower-tier subcontractor
```

### Modeling implications

ProjectFlow’s customer organization may play any role in the chain.

The system should allow:

- recording vendors used by the organization
- optionally noting upstream/downstream relationships where useful
- not requiring full multi-party network collaboration in V1

### Fork

- **Option A:** Model full party graph/hierarchy early  
- **Option B:** Model org’s direct vendors first; keep optional parent/tier fields  
- **Recommendation:** Option B for V1; keep domain room for richer graph later  
- **OWNER DECISION REQUIRED**

---

## 7. Commercial artifacts with vendors

Vendors may have:

- RFQs / incoming quotes
- purchase orders (future)
- subcontractor agreements
- progress claims / invoices
- payments
- retention / withhold concepts (future, construction-important)
- change requests on vendor scope (future)

Retention (holdback) is common in construction and should not be forgotten in roadmap planning.

---

## 8. Insurance and compliance docs

Especially for subcontractors:

- liability insurance
- workers coverage
- professional indemnity (where relevant)
- certifications/licenses
- expiry alerts

Can reuse Insurance and Documents modules rather than inventing a closed silo.

---

## 9. Balances and history

Eventually answer:

- How much did we spend with Vendor X this year?
- What is unpaid?
- Which projects used them?
- What was quoted vs final cost?
- Are they profitable/reliable for us?

V1 can start with profile + project links + invoice/expense associations.

---

## 10. Vendor vs Employee vs User

| Record | Meaning |
|--------|---------|
| Vendor | External company/party |
| Employee | Internal workforce cost entity |
| User | Login identity |

A subcontractor’s worker generally is **not** automatically an Employee of the tenant.  
If later needed, external collaborators can be invited as limited users without converting the vendor company into an employee.

---

## 11. V1 recommendation

Include **capability** (optional usage):

- expense capture without requiring Vendor
- plain supplier name on expense
- optional promote/link to Vendor
- vendor registry when user wants structure
- domains/tags
- link vendor to work package / project
- attach documents
- associate expenses/invoices/payments

Defer:

- full procurement suite
- vendor portal
- automated compliance scoring
- deep multi-tier network graph
- retention accounting sophistication

Do not emphasize empty Vendor module widgets when unused (`39`).

---

## 12. Related documents

- Flexible workflows → `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`
- Domain model → `02-DOMAIN-MODEL.md`
- Work packages → `03-BUSINESS-PROJECT-MODEL.md`
- Costs/invoices → `04-FINANCIAL-MODEL.md`
- Insurance/docs → `08-ASSETS-VEHICLES-INSURANCE.md`, `09-DOCUMENTS-EXPENSE-CAPTURE.md`
