# Wave 3 Review Findings — Financial + Security

**Reviewer:** Auto (financial + security)  
**Date:** 2026-08-09  
**Scope:** `src/modules/{ap,procurement,portal,assets,field-ops,financials}/`, AP actions, vendor portal, cash outgoing

## Summary

Prior pass fixed W3-F01–F08. This pass found and fixed additional MEDIUM items (F09–F14). No BLOCKER. No push. Prefer no drizzle edits (none made this pass).

---

## Findings (this pass — FIXED)

### W3-F09 — MEDIUM — Security / Tenancy — PO / RFQ / quote project refs not org-validated

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `procurement/application/{purchase-orders,rfqs,quotes}.ts` (+ new `assert-project-refs.ts`) |
| **Before** | `projectId` / `workPackageId` accepted without org membership check (FK only checks UUID exists). |
| **After** | `assertOptionalProjectRefsInOrg` validates project (+ work package ↔ project) inside `organizationId` before insert. |
| **Status** | **FIXED** |

### W3-F10 — MEDIUM — Security — Portal vendor quote `projectId` not org-validated

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `portal/application/submit-vendor-quote-candidate.ts` |
| **Before** | Candidate / on-behalf quote could attach foreign `projectId`. |
| **After** | `findProjectById(org, projectId)` before insert. |
| **Status** | **FIXED** |

### W3-F11 — MEDIUM — Financial / Integrity — AP match expense vendor unchecked

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `ap/application/matches.ts`, `ap/data/ap.repository.ts` (`findExpenseInOrg` → `vendorId`) |
| **Before** | Propose match to existing expense only checked org + currency; cross-vendor expense link allowed. |
| **After** | When expense has `vendorId`, must equal bill vendor (`ap.errors.vendorMismatch`). |
| **Status** | **FIXED** |

### W3-F12 — MEDIUM — Financial / Integrity — AP bill PO line without header PO vendor check

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `ap/application/bills.ts` |
| **Before** | Lines with `purchaseOrderLineId` and no header `purchaseOrderId` could reference another vendor’s PO line. |
| **After** | Load line’s PO; require `po.vendorId === bill.vendorId`. |
| **Status** | **FIXED** |

### W3-F13 — MEDIUM — Security — Inventory movement on archived item

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `assets/application/inventory.ts` |
| **Before** | `recordInventoryMovement` accepted archived inventory items. |
| **After** | `!item \|\| item.archivedAt` → NotFound. |
| **Status** | **FIXED** |

### W3-F14 — MEDIUM — Financial — `findOpenCommittedCostForPo` ignored status

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `procurement/data/procurement.repository.ts` |
| **Before** | Any committed_cost row (incl. cancelled/closed) blocked opening a new open commitment on issue. |
| **After** | Filters `status IN ('open','partially_consumed')`. |
| **Status** | **FIXED** |

### W3-DOC — MEDIUM — RLS assumptions re-documented on Wave 3 repos

| | |
|---|---|
| **Severity** | MEDIUM (verify item) |
| **File(s)** | `ap/data/ap.repository.ts`, `procurement/data/procurement.repository.ts`, `assets/domain/inventory.ts` |
| **Before** | App-layer org filters present; Wave 3 AP/procurement repos lacked explicit RLS-vs-app comments. |
| **After** | Comments state RLS is defense in depth; app must filter `organizationId` + permission asserts. |
| **Status** | **FIXED** |

---

## Prior findings (already FIXED — re-verified)

| ID | Severity | Topic | Status |
|---|---|---|---|
| W3-F01 | HIGH | Match currency + over-match | Still fixed |
| W3-F02 | HIGH | PO vendor org check | Still fixed |
| W3-F03 | HIGH | Vendor grant kind CHECK (0012) | Still fixed (schema; not re-edited) |
| W3-F04 | MEDIUM | Cash outgoing unmatched remainder | Still fixed |
| W3-F05 | MEDIUM | Match PO vendor === bill vendor | Still fixed |
| W3-F06 | MEDIUM | Vendor scope mutation reject | Still fixed (+ tests) |
| W3-F07 | MEDIUM | Maintenance amount+currency | Still fixed (create + update merged integrity) |
| W3-F08 | MEDIUM | AP bill projectId org check | Still fixed |

---

## Verified OK (no change)

| Check | Result |
|---|---|
| AP Bill ≠ Expense; accept never posts Expense | `assertAcceptMatchDoesNotCreateExpense`; audit `expenseCreated: false` |
| CommittedCost ≠ Expense | Issue path + domain guards |
| Inventory movement ≠ Expense | Domain + audit `expensePosted: false` |
| ExternalPrincipal ≠ Membership | Portal session `kind: vendor_portal`; no membership insert |
| Vendor portal cannot mutate financial truth | Candidates only; scopes allowlist + mutation reject |
| Cash outgoing from AP bills not expenses | `computeOutgoingCashOutlook` + unmatched remainder |
| Permission checks on writes | AP / procurement / portal / assets / field-ops assertPermission |
| Field-ops tenant project refs | Already using `assertProjectRefsInOrg` |

---

## Residual LOW

| ID | Note |
|---|---|
| W3-L01 | Finance role has `ap.read` not `ap.manage` — intentional least privilege |
| W3-L03 | Vendor `rfq.read` lists all org sent RFQs (no invite table in V1) — documented foundation limit |
| W3-L04 | Cash outgoing when caller lacks `AP_READ` uses `no_ap_due_dates` disclosure (permission-scoped, not a separate key) |

---

## Tests

```
npx tsc --noEmit
npx vitest run tests/unit/ap tests/unit/procurement tests/unit/portal tests/unit/assets tests/unit/field-ops tests/unit/financials/cash-flow.test.ts tests/unit/ocr tests/unit/offline
```

(typecheck clean; 21 files / 138 tests passed)

---

## Integrator closeout (2026-08-09)

- Re-verified W3-F01–F14 in code; no remaining BLOCKER/HIGH/MEDIUM open
- Closed residual **W3-F07** gap: `updateMaintenanceRecord` now enforces amount+currency together (merged with existing) in `src/modules/assets/application/maintenance.ts`
- **0012 freeze-ready:** yes — kind-scoped portal CHECK left as-is (`0012-PATCH-NOTES.md`)
- Residual severity: **LOW only** (W3-L01, W3-L03, W3-L04)
