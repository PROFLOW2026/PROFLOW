# 00 — Project Overview

**Status:** Draft with owner direction applied (2026-08-09)  
**Phase:** Planning only  
**Product working name:** ProjectFlow (temporary)

---

## 1. Vision

ProjectFlow is a **project-based business operating system**.

It helps owners of project-driven businesses know, at any moment:

- how much a project **really costs**
- how much it is **expected to earn**
- what **changed** since the original deal
- what work is **done but not yet billed**
- what the **whole business** looks like financially

Initial focus: **construction, contracting, trades, design, engineering, and consulting** in the built environment — without hardcoding the product to a single profession.

---

## 2. Product purpose

### Primary job-to-be-done

> “I need to know if this project (and my business) is actually profitable — after people, materials, subcontractors, changes, and overhead — not only after invoices.”

### Core outcomes

1. **Project truth** — contract value, changes, costs, invoiced/paid/outstanding, and remaining exposure in one place.
2. **Business truth** — cross-project cash, forecast profit, and overhead visibility.
3. **Change control** — extras and reductions tracked with versions and approvals.
4. **Future scale** — architecture that can grow into a global, multi-language, multi-country product.

---

## 3. Initial market

### Geography

- First market: **Israel**
- First full UI language: **Hebrew (`he-IL`)**
- Architecture: **global-first** from day one

### Primary vertical

**Construction / Built Environment**, including but not limited to:

#### Contractors and trades

Electricians, plumbers, structural contractors, finishing contractors, renovation contractors, main contractors, turnkey contractors, subcontractors, HVAC, drywall, paint, flooring, waterproofing, aluminum, carpentry, metalwork, low voltage, communications, cameras, fire detection/suppression, smart home, earthworks, landscaping, pools, and similar.

#### Design, engineering, and consulting

Architects, interior architects, designers, engineers, structural engineers, electrical / plumbing / HVAC consultants, safety, accessibility, acoustics, energy, green building consultants, project managers, supervisors, surveyors, quantity surveyors, BIM, drafting, permitting, systems coordination, and similar.

### Critical product rules

- The user must be able to create **custom domains and service types** that are not in any preset list.
- The product is **not** “an electrician app”, “a contractor app”, or “an architect app”.
- Broad Built Environment market is in scope, but V1 must **not** force heavyweight GC-only UX on simple trades/consultants.
- Every Project has ≥1 **WorkPackage** (auto default/general package; UI may hide until multi-package).
- **Progressive complexity:** offer many capabilities; force minimal configuration (`39`).

---

## 4. Architectural posture

```text
General Business / Project Core
+ Construction / Built Environment vertical
(+ future vertical packs later)
```

Future verticals that should remain architecturally possible (not in V1 UX):

- Law firms
- Accounting firms
- Business consultants
- Other professional service firms

No special modules for those verticals are required now. The **core model must not block them**.

---

## 5. Conceptual hierarchy (non-final naming)

A useful working hierarchy:

```text
Business / Organization
  → Client
    → Project / Engagement
      → WorkPackage (mandatory; default/general allowed)
        → Phase (optional in V1)
          → Costs / Billing / Time / Documents
```

Task/Activity/WBS/Gantt depth is deferred. Names above are conceptual working terms. See `18-OPEN-QUESTIONS.md`.

---

## 6. People vs business

| Concept | Meaning |
|---------|---------|
| **User** | A person who can sign in |
| **Organization / Business** | The tenant that owns business data |

Rules:

- A user is **not** the business.
- An organization can have many users and many roles.
- In the future, one user may belong to **multiple organizations**.

---

## 7. Guiding principles (summary)

1. **Plan wide, build incrementally**
2. **Configuration over hardcoding**
3. **Global-first, Israel-first delivery**
4. **Effective-dated history** for rates, taxes, and business parameters
5. **Money = amount + currency**
6. **Separate contract value, invoiced, paid, and outstanding** (do not casually label “Revenue” in V1)
7. **Roles + permissions**, not only admin/user
8. **Multi-tenant isolation** from day one
9. **Document-aware** from the start
10. **Auditability** for money and permissions

Full detail: [`01-PRODUCT-PRINCIPLES.md`](./01-PRODUCT-PRINCIPLES.md)

---

## 8. What success looks like (product level)

A business owner can answer:

- What is the current contract value after approved Change Orders?
- What is still pending approval?
- What is Actual Cost to Date (direct vs allocated shared/overhead)?
- What is Estimated / Forecast Profit?
- What is Invoiced vs Paid vs Outstanding?
- Which projects are drifting toward loss?

Field workers can quickly:

- log time
- capture an expense / invoice photo
- add a change request
- attach a site photo

---

## 9. Current phase boundaries

### In scope now

- Product and domain documentation
- Open questions and decision framing
- Proposed V1 scope and roadmap

### Out of scope now

- Application code
- Database schema implementation
- UI
- Auth implementation
- Cloud provisioning
- OCR / AI implementation

---

## 10. Related documents

- Principles → `01-PRODUCT-PRINCIPLES.md`
- Domain → `02-DOMAIN-MODEL.md`
- V1 proposal → `16-V1-SCOPE.md`
- Open decisions → `18-OPEN-QUESTIONS.md`
