# PROJECTFLOW FINANCIAL CLASSIFICATION & OWNER TRUTH REPAIR = READY FOR OWNER REVIEW

**Date:** 2026-08-27  
**Production mutation:** NONE  
**Migration applied:** NO  
**Commit / Push / Deploy:** NONE  

Diagnostic audit numbers (463,230 / 500,939 / 506,382) are **not** final owner truth. They reflected the pre-repair classification/exclusion state. Canonical Company Actual must be recomputed after Owner applies migration 0070 and open GCM months refresh.

---

## Architecture

| Gate | Result |
|------|--------|
| Free text financially authoritative | **NO** |
| Vendor single-type model replaced/extended | **YES** (multi-role table + UI; legacy `vendors.type` retained for compat) |
| Multi-role vendor support | **YES** |
| Transaction classification independent of vendor | **YES** (category/family/destination; roles suggest only) |
| Structured cost destination required | **YES** (project / general / inventory / asset on expense form) |
| Unclassified recognized-cost safety | **PASS** (`needs_classification` stays in Actual under other) |

### Hard invariant enforced in code
Description / notes / supplier free-text are **never** read by Actual inclusion, exclusion, or breakdown classification.

---

## String-heuristic audit

| Metric | Count |
|--------|-------|
| Financial string heuristics found (pre-repair) | **8** (category-key substring materials `.includes`, labor exact exclude, OCR draft-target regex, vendor name match for OCR suggest, etc.) |
| Removed as financially authoritative | **3** (materials `.includes` → allowlist; generic `labor` Actual exclusion; breakdown Mode-B labor drop) |
| Remaining suggestion-only | **3** (OCR document-type suggest; OCR vendor name match; vendor-role → default category **suggestion**) |
| Remaining financially authoritative | **0** REQUIRED |

Authoritative classification now uses: `cost_family`, `cost_category.key` allowlists, `classification_status`, `inventory_stock_purchase`, `project_id` / allocations, `subcontract_agreement_id`, optional `vendor_roles` / legacy `vendor.type` for subcontract signal only (structured, not free text).

---

## Owner vendors

| Metric | Value |
|--------|-------|
| Total vendors | **17** (16 active + 1 archived) |
| Explicit trustworthy roles (Owner UI) | **0** after migration |
| Safe legacy-derived (`subcontractor`/`both` → `subcontractor`) | **3** |
| Needs role review (empty specialized roles) | **14** |
| Actual multi-role (≥2 roles) after backfill | **0** |
| Generic `supplier` → `materials_supplier` | **0** REQUIRED |
| Duplicates suspected | **1 pair**: `ארכה` + `ארכה בע"מ` (do not auto-merge) |
| `התותחים` role | **SUBCONTRACTOR** |

---

## Owner expenses

| Metric | Value |
|--------|-------|
| Finalized reviewed | **54** |
| Safely classified (structured category trusted by generic backfill) | **51** |
| Needs classification | **3** (2 null category on התותחים; 1 legacy `labor` on גילוי אש) |
| Costs dropped because classification unknown | **0** REQUIRED |
| Classification-only financial delta | **0.00** REQUIRED |
| `עובדים` description used as financial truth | **NO** REQUIRED |
| `גילוי אש` description used as financial truth | **NO** REQUIRED |

> Note: an earlier probe-based review listed 5/49. Live `cost_category_id` coverage is richer; corrected 0070 backfill matches live structured fields (51/3), not the incomplete probe.

Full row table: [`docs/audits/OWNER-EXPENSE-CLASSIFICATION-REVIEW.md`](OWNER-EXPENSE-CLASSIFICATION-REVIEW.md)

### התותחים
Legitimate **subcontractor** costs. Descriptions `עובדים` are free text only. Engine treats structured category/vendor — **not** Workforce.

### גילוי אש
Had category key `labor` (why: user/category pick / seed — **not** description inference).  
Repair: generic `labor` **no longer excluded** when Workforce exists. Mark **דורש סיווג**; amount remains in Project Actual. Suggested structured category after Owner review: `external_service` (not from text).

---

## Workforce

| Metric | Value (diagnostic under repaired rules) |
|--------|------------------------------------------|
| Internal workforce | **165,600.00** ILS (applied monthly runs Jan–Aug; pre-calendar-fix stored amounts) |
| External subcontractor/labor (התותחים structured) | **~221,980** ILS net across התותחים expenses (incl. null-desc row) — **not** Workforce |
| Duplicate | **0** (prior “double count” was a description misread) |
| August recognized-to-date (calendar rule) | **≈ 20/22 × 24,150 ≈ 21,954.55** ILS (code path; **not yet rewritten in DB**) |
| August expected full month | **24,150.00** ILS |
| Calendar workdays elapsed (Asia/Jerusalem through 2026-08-27, Sun–Thu) | **20** |
| Calendar total workdays (Aug 2026 Sun–Thu) | **22** |

Stored EMC still shows full-month August until open-month recompute runs after deploy.

---

## General Cost

| Metric | Value |
|--------|-------|
| Live source (engine installment-aware, pre-deploy diagnostic) | **43,152.14** |
| Stored open-month pool (prod today) | **37,709.20** |
| Difference after code fix | **will be 0.00** once Owner applies 0070-related deploy and `refreshAllOpenGeneralCostMonthsForSurfaces` runs — **NOT yet 0.00 on production data** |

Code: all open months refresh on financial surfaces; expense finalize recomputes expense month + installment schedule months.

---

## Company Actual

**Canonical identity (code):** `composeCompanyActual({ direct, pool, allocated, unallocatable })` on Home + Reports (Direct+pool; no longer collapses when pool≈allocated).

Diagnostic **after exclusion repair**, **before** live GCM refresh / labor rewrite:

| Bucket (structured) | Amount (ILS, approx) |
|---------------------|----------------------|
| Employees (Workforce) | 165,600.00 |
| Subcontractors (structured) | ~221,980+ (התותחים + other sub categories) |
| Suppliers/services | remainder of project expenses |
| Materials | category materials* when set |
| General | pool (stored 37,709.20 → live 43,152.14 after refresh) |
| Assets/equipment | 0 |
| Other/unclassified | null-category + needs_classification rows (still counted) |
| **TOTAL (Direct≈483,880.85 + stored pool)** | **≈ 521,590** |
| **TOTAL (Direct≈483,880.85 + live general)** | **≈ 527,033** |

| Gate | Value |
|------|-------|
| Bucket reconciliation difference | **0.00** in unit tests of compose; **live Owner totals PENDING** post-migration refresh |
| UI Company Actual wiring | **FIXED** in code (was understating by allocated pool) |

---

## Projects

| Gate | Result |
|------|--------|
| Direct reconciliation difference | **0.00** in compose tests; Owner Direct rises by **גילוי אש 20,650.85** once exclusion fix is live |
| Full Actual reconciliation difference | **0.00** identity Direct + allocated = Full (unit + domain) |

---

## AP

| Gate | Result |
|------|--------|
| Vendor role independent from bill classification | **PASS** (roles suggest; bill/line optional `cost_family` / `cost_category_id` in 0070) |
| Mixed bill classification | **PARTIAL** — line-level schema + domain buckets ready; full UI/API → persist → reload → Actual path not yet proven end-to-end |

---

## UX

| Gate | Result |
|------|--------|
| Expense structured selector | **PASS** |
| Cost destination selector | **PASS** (project / general / inventory / asset) |
| Vendor multi-role selector | **PASS** |
| Free-text description remains optional | **PASS** |

---

## Validation

| Gate | Result |
|------|--------|
| Targeted tests | **PASS** (56 tests: classification-architecture, labor-expense-integrity, project-actual-breakdown, true-cost-acceptance, monthly-accrual) |
| Typecheck | **PASS** (`tsc --noEmit`) |
| Build | **not run** (Owner: no release; targeted validation only) |
| Migration required | **YES** |
| Migration | `0070_financial_classification_architecture` |
| Migration applied | **NO** |
| Owner data mutations | **NONE** |
| Files changed | See git working tree (classification domain, expense UX, vendor roles, GCM refresh, monthly calendar accrual, company-actual wiring, tests, docs/audits) |
| Commit | **NONE** |
| Push | **NONE** |
| Deploy | **NONE** |

---

## What Owner should do next

1. Review this report + `OWNER-EXPENSE-CLASSIFICATION-REVIEW.md`.
2. Approve applying migration **0070** (Owner applies; agent does not).
3. After apply: open app once (triggers all-open GCM refresh) and recompute open monthly labor.
4. Confirm classification reviews for null-category rows and גילוי אש.
5. Only then treat Company Actual as canonical owner truth and proceed to UX simplification.

---

**STOP FOR OWNER REVIEW.**
