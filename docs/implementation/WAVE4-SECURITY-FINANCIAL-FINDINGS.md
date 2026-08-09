# Wave 4 — Security + Financial Integrity Findings

**Reviewer:** Auto/Composer (Wave 4 residual sweep)  
**Date:** 2026-08-09  
**Scope:** Cross-tenant R/W, role escalation, ExternalPrincipal, API/portal scopes, crafted forms, IDOR, profit access, documents, import/export auth, webhook secrets, service-role / public-env separation; financial adversarial (CO, VAT, voids/credits/partials, AP, PO commitment, expense actual, FX, cash flow, CRM conversion, imports/retries).

**Policy:** No push. No remote migrations. No notifications. Frozen migration `0012` SQL not edited.

---

## Summary

No remaining **BLOCKER**. All **HIGH/MEDIUM** items found this pass are **FIXED** with tests. Residual severity: **LOW only**.

---

## Findings FIXED (this residual sweep)

### W4-F07 — MEDIUM — Security / Secrets — Production webhook KEK reused service-role / DB URL

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `api/application/webhook-kek.ts`, `shared/env/server.ts`, `.env.example` |
| **Before** | Missing `WEBHOOK_SECRET_KEK` fell back to hashing `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` even under `APP_ENV=production`. |
| **After** | Production requires explicit `WEBHOOK_SECRET_KEK` (boot guard + resolve guard). Local/preview may still fall back. |
| **Tests** | `tests/unit/shared/env.test.ts`, `tests/unit/api/webhook-security.test.ts` |
| **Status** | **FIXED** |

### W4-F08 — MEDIUM — Security / IDOR — OCR extract accepted foreign `documentId`

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `ocr/application/extract-receipt.ts` |
| **Before** | `documentId` was stored on the job without verifying the document belongs to the active org. |
| **After** | `findDocumentById(org, id)` required; missing/deleted → `NotFoundError`. |
| **Tests** | `tests/unit/ocr/ocr-foundation.test.ts` |
| **Status** | **FIXED** |

### W4-F09 — MEDIUM — Security / Tenancy — API accepted `organizationId` query probe

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `api/http/tenant-guard.ts`, `app/api/v1/projects/route.ts` |
| **Before** | Client `organizationId` query was silently ignored (comment said reject). |
| **After** | `assertNoClientOrganizationOverride` throws `ValidationError` (422). |
| **Tests** | `tests/unit/api/api-scope.test.ts` |
| **Status** | **FIXED** |

### W4-F10 — MEDIUM — Security / Tenancy — Portal name joins lacked org predicates

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `portal/data/portal.repository.ts` |
| **Before** | Grant / RFQ / PO left-joins on client/project/vendor used id-only matches. |
| **After** | Joins also require `organizationId` match (defense in depth against cross-tenant name leakage). |
| **Status** | **FIXED** |

### W4-F11 — MEDIUM — Security / Authz — API key rotate could re-issue unknown scopes

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `api/application/manage-api.ts` (`rotateApiKey`) |
| **Before** | Rotation copied `existing.scopes` verbatim. |
| **After** | Scopes re-normalized to allowlist; empty/invalid → domain error. |
| **Tests** | `tests/unit/api/webhook-security.test.ts` (scope strip contract) |
| **Status** | **FIXED** |

### W4-F12 — MEDIUM — Security / Export — Clients/vendors builders lacked local assert

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `exports/application/build-csv-export.ts` |
| **Before** | Relied solely on nested list helpers for clients/vendors. |
| **After** | Explicit `assertPermission` on `CLIENTS_READ` / `VENDORS_READ`. |
| **Status** | **FIXED** |

---

## Findings FIXED (earlier Wave 4 pass — still verified)

### W4-F01 — HIGH — Financial / Integrity — Change Order wrote tax-inclusive quote total into CCV

| | |
|---|---|
| **Severity** | HIGH |
| **File(s)** | `commercial/domain/contract-value.ts` (`changeOrderApprovedNetAmount`), `commercial/application/quotes-and-approval.ts`, `commercial/ui/approve-change-form.tsx` |
| **Before** | Approval could use quote `totalAmount` (incl. VAT) for CO / contract value events → VAT contaminated profit basis. |
| **After** | Always uses quote **subtotal** (net); UI preview matches write path. |
| **Tests** | `tests/unit/commercial/change-order-net.test.ts` |
| **Status** | **FIXED** |

### W4-F02 — HIGH — Security / IDOR — Approve CR with foreign quoteVersionId (intra-org)

| | |
|---|---|
| **Severity** | HIGH |
| **File(s)** | `commercial/data/quotes.repository.ts` (`findQuoteVersionForChangeRequest`), `commercial/application/quotes-and-approval.ts` |
| **Before** | `findQuoteVersionById(org, id)` allowed attaching any org quote version to any CR on approve / draft update. |
| **After** | Version must join parent quote with `quotes.changeRequestId ===` target CR. |
| **Tests** | `tests/unit/commercial/quote-version-binding.test.ts` |
| **Status** | **FIXED** |

### W4-F03 — MEDIUM — Security / Tenancy — Offline sync ignored draft `organizationId`

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `offline/application/sync-mutations.ts` (`submitOfflineDraftAction`) |
| **Before** | Queued draft org id was unused; writes always used session org → multi-org switch could mis-apply drafts. |
| **After** | Rejects when `input.organizationId !== context.organizationId`. |
| **Tests** | `tests/unit/offline/org-mismatch.test.ts` |
| **Status** | **FIXED** |

### W4-F04 — MEDIUM — Security / Authz — Project financials expense rollup without `expenses.read`

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `financials/application/get-project-financials.ts` |
| **Before** | Always loaded expense contributions after only `project_financials.read`. |
| **After** | Loads expenses only when `EXPENSES_READ` held; otherwise `direct_expenses` stays uncovered (honest coverage). |
| **Tests** | `tests/unit/financials/expense-permission-gate.test.ts` |
| **Status** | **FIXED** |

### W4-F05 — MEDIUM — Security / Export — Billing/AR/expense builders lacked local assert

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `exports/application/build-csv-export.ts` |
| **Before** | Relied solely on nested list helpers for some kinds. |
| **After** | Explicit `assertPermission` on expenses, billing, AR outstanding, AR aging. |
| **Status** | **FIXED** |

### W4-F06 — MEDIUM — Integrity — Import duplicate retries (email / employee number)

| | |
|---|---|
| **Severity** | MEDIUM |
| **File(s)** | `imports/domain/duplicates.ts` (`detectExistingDuplicates`) |
| **Before / After** | Existing email / employeeNumber collisions are **errors** (not warnings) so confirm cannot re-create on retry. Name collisions remain warnings. |
| **Tests** | `tests/unit/imports/csv-import.test.ts` |
| **Status** | **FIXED** (verified this pass) |

---

## Verified OK (no change required)

| Check | Result |
|---|---|
| ExternalPrincipal ≠ Membership | Portal session `vendor_portal` / `customer_portal`; no membership insert |
| External candidate ≠ ledger | Candidates only; accept AP match never creates Expense |
| Vendor RFQ browse | Vendor-associated supplier_quote only (no org-wide dump) |
| CommittedCost ≠ Expense | Issue + domain guards |
| AP Bill ≠ Expense | Matching links only |
| VAT ≠ profit (CRM) | Conversion uses subtotal / tax-inclusive flag path |
| Forecast ≠ Actual | Cash flow labels + coverage |
| Contract ≠ Billing ≠ Payment | Outstanding derived; voids/credits handled |
| API key scopes | Allowlist + `assertApiKeyHasScope`; hash never listed |
| Webhook secrets | Sealed at rest; `secretHash` stripped from list; SSRF URL hardening |
| Service-role / public env | `assertNoSecretPublicEnv`; admin DB only on justified paths |
| Role escalation | `assertCanGrantRole` on invitations |
| Documents | Org-scoped owner verify + download |
| Portal scopes | Vendor mutation scopes rejected; customer whitelist |
| Profit UI / export | Gated by `PROJECT_PROFIT_READ` |

---

## Residual LOW

| ID | Note |
|---|---|
| W4-L01 | Import name-only collisions remain warnings (intentional soft identity). |
| W4-L02 | `issueQuoteVersion` is org-scoped by id only (manage permission covers all CRs in org). |
| W4-L03 | Finance role may hold `ap.read` without `ap.manage` — intentional least privilege (also W3-L01). |
| W4-L04 | Webhook delivery idempotency uniqueness is application-enforced until optional `0015` unique index. |
| W4-L05 | Customer portal `documents.read` is projection-ready; public login remains foundation-only. |
| W4-L06 | Local/preview webhook KEK may still derive from service-role / DATABASE_URL when `WEBHOOK_SECRET_KEK` unset. |

---

## Tests run

```
npx vitest run tests/unit/commercial/change-order-net.test.ts tests/unit/commercial/quote-version-binding.test.ts tests/unit/offline/org-mismatch.test.ts tests/unit/financials/expense-permission-gate.test.ts tests/unit/imports/csv-import.test.ts tests/unit/api/webhook-hardening.test.ts tests/unit/api/api-scope.test.ts tests/unit/api/webhook-security.test.ts tests/unit/portal/vendor-scopes.test.ts tests/unit/shared/env.test.ts tests/unit/ocr/ocr-foundation.test.ts
```
