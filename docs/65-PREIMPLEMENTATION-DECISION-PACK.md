# 65 — Pre-Implementation Decision Pack

**Status:** **OWNER APPROVED** (2026-08-09) — domain/data recommendations accepted and marked DECIDED in `18`  
**Phase:** Planning only (blueprint next; no application code in this pack)  
**Scope:** Domain / data / product policy. Stack A approved separately (`67`, `18` J*).  
**Date:** 2026-08-09

---

## 1. Purpose

Close only implementation-critical product/data decisions that must not be invented mid-coding.  
Stack review is the **next** dedicated task.

---

## 2. Already locked (do not reopen)

Includes among others: A2, A3, B1, B4, B6/U6, C1, C2/U7, D1–D4, E1, G3, U1–U7, progressive complexity, WorkPackage mandatory, CR≠CO, basic billing, overhead capability, True Cost shape, Hebrew glossary, nav/modules, project statuses, **Visual Direction B Deep Teal (V1)**.

Full log: `18-OPEN-QUESTIONS.md`.

---

## 3. Classification of remaining OPEN / PARTIAL items

### IMPLEMENTATION BLOCKER  
Must decide before schema / authz / financial integrity coding.

### CAN DEFER SAFELY  
Architecture already protects the fork; V1 can start with a thin default.

### FUTURE ONLY  
Not needed for V1 implementation.

### STACK REVIEW (next task)  
Providers/frameworks — out of this pack’s approval scope, listed for completeness.

| ID | Topic | Classification | Notes |
|----|-------|----------------|-------|
| **B2** | Contracts per Project | **IMPLEMENTATION BLOCKER** | Schema cardinality |
| **B3** | Ad-hoc project domain | **IMPLEMENTATION BLOCKER** | Domain write path |
| **B5** | Terminology aliases | **CAN DEFER SAFELY** | U5 glossary + canonical keys enough for V1 UI; org aliases later |
| **C3** | Client approval channel | **IMPLEMENTATION BLOCKER** | Approval record shape |
| **D5** | Financial corrections | **IMPLEMENTATION BLOCKER** | Billing/Payment integrity |
| **E2** | Employee ↔ User | **IMPLEMENTATION BLOCKER** | Identity schema |
| **E3** | Past rate corrections | **IMPLEMENTATION BLOCKER** | RateVersion / adjustment model |
| **F1** | Party model | **IMPLEMENTATION BLOCKER** | Core entity shape |
| **F2** | Vendor hierarchy V1 | **IMPLEMENTATION BLOCKER** | How deep Vendor fields go in V1 |
| **G1** | Tax draft vs freeze | **IMPLEMENTATION BLOCKER** | Tax snapshot rules |
| **G2** | Unit storage | **IMPLEMENTATION BLOCKER** | Quantity value object (even if lightly used in V1) |
| **H1** | Role builder depth | **IMPLEMENTATION BLOCKER** | Seed roles / permission UI |
| **H2** | PM financial defaults | **IMPLEMENTATION BLOCKER** | Permission defaults |
| **I1** | Soft delete policy | **IMPLEMENTATION BLOCKER** | Archive columns / delete APIs |
| **I2** | Audit architecture | **IMPLEMENTATION BLOCKER** | AuditEvent vs event sourcing |
| **A1** | Final product name | **FUTURE ONLY** / defer | Working name ProjectFlow OK |
| **K1** | SaaS packaging/pricing | **FUTURE ONLY** | Keep technical modularity only |
| **L1** | Pilot profile | **CAN DEFER SAFELY** | Not a coding prerequisite |
| **L2** | Pilot success metric | **CAN DEFER SAFELY** | Not a coding prerequisite |
| **M1** | External portal identity | **FUTURE ONLY** | Portals out of V1 |
| **M4** | CRM quote storage | **FUTURE ONLY** | CRM out of V1 |
| **V2** | Production font | **STACK REVIEW** / UI impl | System font interim OK |
| **V3** | Logo / exact hex | **CAN DEFER SAFELY** | Direction B locked; hex polish later |
| **J1–J2, J4–J7** | Stack/providers/tenancy mechanics | **STACK REVIEW** | Next dedicated task |
| **J3** | PostgreSQL preferred | Direction decided; host = stack review | |

---

## 4. Recommendation package — APPROVED

Owner accepted all IMPLEMENTATION BLOCKER recommendations below on **2026-08-09**. See `18` for DECIDED wording.

| ID | Current status | Recommendation | Why | Blocks coding? |
|----|----------------|----------------|-----|----------------|
| **B2** | OPEN | Schema: Project **1→N Contracts** from day one. V1 UX: expose **one Primary Contract** only (flag `is_primary` / similar). | Avoids painful migration when multi-contract appears; UI stays simple. | **Yes** |
| **B3** | OPEN | Allow **ad-hoc domain on Project**. Prompt: “Add this domain to business services too?” Do not force Settings first. | Matches Progressive Complexity; catalog grows from real work. | **Yes** |
| **B5** | OPEN | Canonical English concepts stable forever. V1 display = i18n + U5 Hebrew glossary. Org custom aliases **later**, never changing financial semantics. | U5 already covers V1 labels; alias engine can wait. | **No** (safe defer) |
| **C3** | OPEN | V1: **internal approval only** — who, when, notes, optional evidence upload (PDF / signed quote / email or WhatsApp screenshot). No portal, no magic link, no e-sign. | Enough for CR→CO; portals are future (`25`). | **Yes** |
| **D5** | OPEN | **Draft** BillingRecord/Payment: editable. **Finalized** internal records: no silent rewrite — use **void/reversal/adjustment + new record** as needed. External accounting invoices attached as Documents are **not** mutated by ProjectFlow. | Preserves history; V1 is not statutory issuer. | **Yes** |
| **E2** | OPEN | Employee ≠ User. **Optional link** only. Employee without login OK; User without Employee OK. | Costing vs auth stay clean. | **Yes** |
| **E3** | OPEN | Future rates: **effective-dated RateVersion**. Past mistakes: **adjustment / correction record**, not silent rewrite. Optional audited recalc tool later. | Historical integrity for True Cost. | **Yes** |
| **F1** | OPEN | **Separate** Client, Vendor, Employee, User + shared reusable Contact/Address/Identifier/Document patterns. No giant Party inheritance table. | Simpler integrity; future verticals map cleanly. | **Yes** |
| **F2** | OPEN | V1: **direct** org↔Vendor relationships. Optional fields: tier, parent note, upstream/downstream note. **No** full network graph UI/engine. | Enough for subcontractors; graph later (`07`, `21`). | **Yes** (thin V1) |
| **G1** | OPEN | **Draft** tax lines recalculate from current rules/overrides when edited. **Issued/finalized** freeze tax snapshot (rate, base, amounts, rule refs). Rule changes never rewrite finals. Overrides audited. | Mid-year VAT changes safe. | **Yes** |
| **G2** | OPEN | Store **entered quantity + entered unit**; optional normalized qty/unit for calc/search. Never destroy “100 sq ft” commercial meaning. | Global-ready; conversion later. | **Yes** |
| **H1** | OPEN | V1: templates **Owner · Manager/PM · Worker · Finance/Bookkeeping** + limited toggles/scopes. Atomic permissions underneath. Full custom role builder later. | Avoid permission-builder product in V1. | **Yes** |
| **H2** | OPEN | Defaults: Owner = all financials+margin. Finance = financial per grants. **PM = costs ON, profit/margin OFF by default** (Owner can enable). Worker = no profit. All configurable. | Conservative; matches progressive disclosure of money. | **Yes** |
| **I1** | OPEN | Soft delete/archive for major master + financial-linked data; Owner restore; no casual hard delete with history; empty drafts may hard-delete; privacy erasure separate later. No fixed retention years yet. | Safe default; legal hold later. | **Yes** |
| **I2** | OPEN | **CRUD + append-only AuditEvent** (not full event sourcing). | Faster V1; enough accountability for money/permissions. | **Yes** |
| **L1/L2** | OPEN | Defer pilot profile/metrics. Broad Built Environment already decided (A2). | Coding ≠ external pilot. | **No** |
| **K1** | OPEN | Defer pricing/entitlements. Keep module **visibility** flags only (U2), not paid-SKU engine. | SaaS billing separate (M3). | **No** |
| **V1 visual** | **DECIDED** | Deep Teal | Owner locked 2026-08-09. | N/A |
| **V2 font** | OPEN | Decide at UI/stack implementation; system font interim OK. | Not domain schema. | Stack/UI |
| **J\*** | OPEN/PARTIAL | Next task: stack review. | Out of this pack. | Stack |

---

## 5. Detail notes (simple)

### B2 — Contracts

Think of Contract like a folder of commercial truth under a Project.  
V1 users see one Primary Contract.  
Database already allows more later without reshaping Project.

### C3 — Approval

PM/Owner marks Awaiting → Approved, fills who/when/note, optionally attaches proof.  
That is enough to create ChangeOrder. Customer self-serve comes later.

### D5 — Corrections

```text
Draft BillingRecord → edit freely
Finalized BillingRecord → void/reverse + new record (not silent edit)
Attached external PDF invoice → immutable file; replace by new upload if needed
```

### F1 — Parties

```text
Client | Vendor | Employee | User   ← separate meanings
Contact / Address / TaxId / DocumentLink  ← shared building blocks
```

### G2 — Units

```text
quantity_entered = 100
unit_entered = sq_ft
quantity_normalized = … (optional)
unit_normalized = m2 (optional)
```

---

## 6. New genuine blockers discovered?

**None beyond the IMPLEMENTATION BLOCKER list above.**  
No domain contradiction that forces redesign of WorkPackage / CR-CO / progressive complexity.

---

## 7. After owner approval of this pack

1. ~~Mark approved IDs DECIDED in `18`~~ — done  
2. ~~Technical stack review~~ — Stack A approved  
3. Implementation Blueprint `71`–`80` — owner review required  
4. Application code only after explicit owner go-ahead to leave planning / start Wave 0

---

## 8. Related

`18`, `02`, `04`, `05`, `06`, `07`, `11`, `12`, `13`, `56`
