# PROJECTFLOW 0070 OWNER REVIEW CORRECTIONS = READY FOR OWNER SQL REVIEW

**Date:** 2026-08-27  
**Migration applied:** NO  
**Owner data mutated:** NO  
**Commit / Push / Deploy:** NONE  

Architectural direction remains approved. Migration 0070 SQL form is corrected for findings F-0070-01…F-0070-10.

Full corrected SQL: `drizzle/migrations/0070_financial_classification_architecture.sql`

---

## Corrections summary

| Finding | Fix |
|---------|-----|
| F-01 Historical default | Column defaults to `needs_classification`; backfill `classified` only when structured category exists, key ≠ `labor` / `internal_employee_payroll`, and family matches |
| F-02 Supplier→materials | Legacy backfill: only `subcontractor`/`both` → role `subcontractor`. `supplier`/`other` → **no** specialized role |
| F-03 RLS fail-closed | `app.install_org_table_rls('vendor_roles','vendors.read','vendors.manage',NULL)` + FORCE; **no** swallowed exceptions |
| F-04 Same-org AP FK | `(cost_category_id, organization_id) → cost_categories(id, organization_id)` with `ON DELETE SET NULL (cost_category_id)` |
| F-05 Category/family | Trigger `assert_cost_category_family_match` + app `assertCostCategoryFamilyConsistent` |
| F-06 Mixed AP | Schema + domain classification ready; full UI/API persistence path **PARTIAL** (not PASS) |
| F-07 Internal payroll | Restricted category; create requires `acknowledgeInternalPayrollException`; **always excluded** from Actual |
| F-08 Vendor role counts | Accurate census below (not “all 17 multi-role”) |
| F-09 Conservation | Classification metadata only; expense net Σ unchanged by migration |
| F-10 Report consistency | Counts below match SQL rule + live Owner DB simulation |

---

## Owner historical classification (live DB simulation of corrected backfill)

Prior review table (5/49) used an incomplete category probe. Live structured `cost_category_id` is present on most finalized rows.

| Metric | Count |
|--------|------:|
| Finalized reviewed | 54 |
| Owner historical classified (safe structured) | **51** |
| Owner historical needs_classification | **3** |
| Needs rows | null category ×2 (התותחים), `labor` ×1 (גילוי אש) |

Unknown recognized costs dropped: **0**  
Classification-only financial delta: **0.00** (amounts not mutated)

---

## Owner vendor roles (after corrected backfill rule)

Total vendors: **17** (16 active + 1 archived `ארכה`)

| Bucket | Count | Notes |
|--------|------:|-------|
| Explicit trustworthy (Owner UI multi-evidence) | **0** | Migration does not invent these |
| Safe legacy-derived | **3** | `subcontractor`/`both` → role `subcontractor` (התותחים, אחמד קבלן חשמל, קרני) |
| Needs review | **14** | Empty roles: all `supplier` + `other` (incl. archived ארכה) |
| Actual multi-role (≥2 roles) | **0** | At most one safe legacy role |

- Generic supplier → materials_supplier inference: **0** REQUIRED  
- `התותחים` role: **SUBCONTRACTOR**  
- `ארכה` / `ארכה בע"מ`: remain **separate** (no auto-merge)

---

## Gates

| Gate | Result |
|------|--------|
| 0070 corrected | **YES** |
| Historical default safe | **YES** |
| vendor_roles RLS | **PASS** |
| RLS silent failure path | **0** REQUIRED |
| AP same-org category FK | **PASS** |
| AP line same-org category FK | **PASS** |
| Category/family contradiction guard | **PASS** |
| Mixed AP end-to-end | **PARTIAL** |
| Internal payroll duplicate guard | **PASS** |
| String-based authoritative financial logic | **0** REQUIRED |
| Migration tests | **PASS** |
| Targeted tests | **PASS** |
| Typecheck | **PASS** |
| Build | **PASS** |

---

## STOP

Do not apply 0070 until Owner SQL review. Agent must not mutate production.
