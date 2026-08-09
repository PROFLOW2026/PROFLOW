# 16 — V1 Scope (Owner-directed MVP)

**Status:** Owner direction accepted for scope content — still **PLANNING ONLY** (no implementation)  
**Phase:** Planning only  
**Decision date reference:** 2026-08-09  
**Working name:** ProjectFlow (temporary)

---

## 1. Purpose

Define the first useful product slice: broad enough for Construction / Built Environment professionals, simple enough for a single-trade contractor or consultant, and honest about real project/business cost (including overhead).

Implementation remains forbidden until the owner explicitly exits planning.

---

## 2. Market posture for V1

V1 structure must serve the broad **Construction / Built Environment** market, including:

- trade contractors
- subcontractors
- main / turnkey contractors
- architects
- engineers
- designers
- consultants
- supervisors / project managers
- similar project-based professionals

**UX rule:** do **not** ship heavyweight GC-only workflows as the default experience.  
The same core must stay simple for a one-trade contractor or a consultant.

---

## 3. V1 product goal

A business can operate on a **progressive-complexity** path (DECIDED 2026-08-09 — `39`):

**Minimal useful path example:** projects, contract value, expenses, change extras, billing/payments, honest profit view — without employees, timesheets, vendor registry, phases, or advanced overhead setup.

**Fuller path (same product):** adopt optional capabilities over time.

Capability goals (available; not all forced on every org):

1. set up an organization and invite users with distinct roles (minimal onboarding)
2. optional domains/services (presets + custom) — not a long mandatory wizard
3. create projects with minimal fields (name-first); clients optional/minimal at create
4. **mandatory WorkPackages internally** with auto Default/General package; UI may hide until multi-package
5. optionally use **Phase** under a WorkPackage
6. set original contract value; run Change Request → Change Order flow (separate concepts; seamless UI)
7. see Current vs Pending contract value
8. record expenses fast (amount-first); optionally use direct/shared/overhead/capital categorization, non-project expenses, splits
9. **optionally** allocate shared/overhead with manual amount / % when the org uses overhead
10. **optionally** use workforce True Cost (or generic labor amounts, or neither)
11. **optionally** record basic outgoing billing + payments + outstanding
12. **optionally** attach documents
13. see explicit financial concepts with **calculation coverage disclosure** (not vague “Revenue” / fake True Profit)
14. use Hebrew UI + Israel defaults on a global-ready foundation

---

## 3.1 Usage posture (not module cuts)

V1 still **supports** overhead, workforce, vendors, billing, documents.  
V1 must **not force** every organization to configure/use all of them.  
Unused modules must not punish with setup blockers or clutter (`39`).

---

## 4. Structural rules (decided)

```text
Project
  → WorkPackage (mandatory; ≥1; auto default/general; UI may hide)
    → Phase (optional)
```

Deferred: full Task / Activity / WBS / Gantt depth.

---

## 5. In scope (Must)

### 5.1 Identity & access

- User auth (email/password + verification + reset) — provider TBD at stack review
- Organization
- Invitations
- Role templates: Owner, Manager/PM, Worker, Finance/Bookkeeping (final names TBD)
- Project-scoped access for PM/worker
- Financial visibility separation

### 5.2 Business structure

- Clients
- Projects for broad built-environment roles (simple UX default)
- Organization domains + project domains
- Service types / delivery mode / project role (basic)
- **Mandatory WorkPackages** (auto-create default/general when user does not need multi-package complexity)
- Optional Phase under WorkPackage

### 5.3 Commercial

- Original contract value
- **ChangeRequest** (request / pricing / negotiation workflow)
- **ChangeOrder** (approved commercial change affecting contract value)
- Quote versions (immutable history)
- Approved additions/reductions → Current Contract Value
- Pending vs approved visibility
- V1 UI may present CR→CO as one seamless flow

### 5.4 Costs, overhead & time

- Vendors registry (basic)
- Expense capture with documents
- Cost families in V1:
  - Direct Project Cost
  - Shared Cost
  - Business Overhead
  - Asset / Capital-related expense categorization
- Recurring / general business expenses
- Expenses not attached to a single project
- Split one expense across projects **and** overhead
- Simple allocation methods in V1:
  - manual amount allocation
  - manual percentage allocation
- Architecture reserved for future methods (hours, revenue/contract basis, labor cost, duration, headcount, custom formulas)
- Employees
- True Cost V1:
  - base hourly / daily / monthly cost
  - simple employer burden / loaded percentage
  - optional additional cost components
  - effective dates + historical rate integrity
- Time entries to project / work package (+ phase when used) and non-project codes

### 5.5 Billing & cash (basic — not statutory invoicing software)

Record outgoing billing/payment tracking:

- invoice / billing record
- amount
- date
- project / change relation
- status
- payments received
- outstanding amount
- attached external invoice/document

Preserve separation:

- Contract Value
- Invoiced
- Paid
- Outstanding

Not in V1: full statutory invoice issuance / accounting suite.

### 5.6 Money & tax (basic)

- Every money value is Amount + Currency
- One organization base currency
- One project currency path in V1
- Multi-currency conversion deferred (not blocked)
- Israel pack defaults (e.g. ILS, VAT effective dating)
- Org / project / document tax override basics

### 5.7 Documents

- Upload/download
- Link to project / client / vendor / expense / change request / change order / billing record
- Permissioned access
- Object storage separate from DB metadata (provider TBD)

### 5.8 Integrity & platform

- Soft delete/archive for major master data
- Audit trail for sensitive changes
- Strong Organization-based multi-tenancy + server-side authorization
- i18n keys; Hebrew first complete UI; English canonical source; RTL/LTR first-class
- Responsive web (field-friendly major actions)
- Preferred technical directions: relational system of record, PostgreSQL preferred, managed auth preferred, clear backend/domain boundaries  
  Exact cloud/auth/storage/hosting providers remain **OPEN** until pre-implementation stack review

### 5.9 Financial UI concepts (explicit labels only)

V1 financial UI focuses on:

- Original Contract Value
- Approved Changes
- Current Contract Value
- Pending Changes
- Invoiced
- Paid
- Outstanding
- Actual Cost to Date
- Estimated / Forecast Final Cost
- Estimated / Forecast Profit

**Do not** label a number “Revenue” unless its definition is explicit.  
Accounting-grade Revenue Recognition is **out of V1**.

When workforce/overhead/etc. are unused, profit/cost views must show **calculation basis / coverage** (included vs not configured) — never imply fully loaded truth (`39`).

---

## 6. Explicitly out of scope for V1 (Defer)

- OCR / AI invoice extraction
- Advanced Cost Allocation Engine (auto multi-method)
- Full assets / vehicles modules (categorization of related expenses is in scope)
- Full insurance module (beyond docs / expense categories / future links)
- Native iOS/Android apps
- Customer approval portal / e-sign
- Deep WBS / Task / Activity / Gantt
- Multi-currency conversions
- Additional country packs beyond Israel
- Non-construction vertical packs UX
- Payroll / statutory payroll filings
- Accounting-grade revenue recognition
- Statutory invoice issuance suite
- Predictive AI forecasting
- Marketplace / public contractor network
- Complex procurement (PO suite)
- Retention accounting sophistication
- MFA/SSO (unless easy via chosen auth provider later)

---

## 7. Dependency map (logical)

```text
Auth + Org + Roles
  → Clients + Domains
    → Projects + mandatory WorkPackages (+ optional Phase)
      → Contract value + ChangeRequest + ChangeOrder + Quote Versions
      → Vendors + Expenses (direct/shared/overhead/capital) + Documents
      → Simple overhead/shared allocation (manual amount / %)
      → Employees + True Cost rates + Time
      → Basic outgoing Billing records + Payments + Outstanding
        → Explicit project/business financial summary
Tax config + Israel pack underpins money documents
Audit + soft delete underpins all sensitive writes
```

---

## 8. Suggested delivery slices (later implementation order)

1. Tenancy, auth, roles, invitations  
2. Clients / projects / domains / mandatory work packages (+ optional phase)  
3. Contract value + ChangeRequest/ChangeOrder + quotes  
4. Expenses (all cost families) + documents + vendors + simple allocation  
5. Employees + time + True Cost (base + burden + optional components)  
6. Basic outgoing billing + payments + outstanding  
7. Explicit financial summary UI + tax basics  
8. Hebrew/RTL polish + field mobile UX pass  

Order is for a future build phase only — not permission to code now.

---

## 9. Success criteria for V1

A pilot contractor/consultant (or similar built-environment professional) can run for several weeks **with only the modules they choose** and answer:

- What is Current Contract Value after approved Change Orders?
- What changes are still pending?
- What costs have been entered so far, and what does the profit figure include/exclude?
- What is Estimated / Forecast Profit **based on entered data** (coverage disclosed)?
- What is Invoiced vs Paid vs Outstanding (if they use billing)?
- Where are the files / external invoices (if attached)?

A solo electrician path without employees/vendors/phases must feel first-class — not “incomplete setup”.

Without spreadsheets as the system of record.

---

## 10. Risks if V1 is too big

- delayed feedback from real users
- weak polish on change-control + cost truth loops
- architecture haste in tenancy/i18n

Prefer cutting advanced reporting polish over cutting: WorkPackage consistency, CR/CO integrity, overhead visibility, or billing/outstanding separation.

---

## 11. Related documents

- Flexible / optional usage → `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`
- Roadmap → `17-FUTURE-ROADMAP.md`
- Open questions → `18-OPEN-QUESTIONS.md`
- Principles → `01-PRODUCT-PRINCIPLES.md`
- Financial model → `04-FINANCIAL-MODEL.md`
