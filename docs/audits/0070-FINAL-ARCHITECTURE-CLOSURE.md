# PROJECTFLOW 0070 FINAL ARCHITECTURE CLOSURE = READY FOR OWNER SQL REVIEW

**Date:** 2026-08-27  
**Migration applied:** NO  
**Owner data mutated:** NO  
**Commit / Push / Deploy:** NONE  

Full SQL: `drizzle/migrations/0070_financial_classification_architecture.sql`

---

## Vendor capability model (F-0070-11)

| Concept | Business question | Canonical? |
|---------|-------------------|------------|
| `organization_catalog_entries` kind=`vendor_category` / `vendor_specialty` + `vendor_catalog_links` | What capabilities / trades does this party have? (multi-select) | **YES — sole capability source** |
| `vendor_engagements.engagement_role_id` | What capacity does this party hold **on a project engagement**? | Project engagement only (not party Actual) |
| `vendors.type` | Legacy single-axis supplier/subcontractor/both/other | **Compat only — never Actual** |
| `vendor_roles` (0070 draft) | — | **REMOVED** (`DROP TABLE IF EXISTS`) |

**Canonical vendor capability model** =
`organization_catalog_entries` (`vendor_category` | `vendor_specialty`) + `vendor_catalog_links`

**Deprecated/compat-only** = `vendors.type`

**Parallel vendor taxonomies** = **0** REQUIRED

0070 seeds system `vendor_category` capability entries (with `metadata.capability=true` + optional `suggestCostCategoryKey`) and safely links only legacy `subcontractor`/`both` → catalog `subcontractor`. Generic `supplier` invents **no** specialized capability.

---

## Transaction classification (F-0070-12 / 14 / 17)

Vendor capability / `vendors.type` **never** decide Actual bucket, category, or family.

Financial truth = transaction `cost_category` (+ optional `subcontract_agreement_id`).

Null category → `needs_classification` / Other, cost still recognized.

### Final shared taxonomy (Expense + AP)

**Direct project:** materials, subcontractor, external_manpower, external_service, equipment_rental, permits_fees, project_travel, other_direct  

**Shared / overhead / asset:** existing shared_* , rent…other_overhead, equipment_purchase, vehicle_purchase, tools  

**Legacy labor:** may exist historically; **hidden from new entry**; not authoritative as `classified`  

**internal_employee_payroll:** **not seeded**; DB rejects on Expense/AP; Workforce is the path  

---

## Owner historical simulation (unchanged rule)

| Metric | Count |
|--------|------:|
| classified | **51** |
| needs_classification | **3** |

התותחים null-category rows → **NEEDS_CLASSIFICATION** until explicit Owner correction  
גילוי אש (`labor`) → **NEEDS_CLASSIFICATION** until explicit Owner correction  

---

## Gates

| Gate | Result |
|------|--------|
| vendor_roles table required | **NO** |
| vendor_catalog_links reused | **YES** |
| Parallel vendor taxonomies | **0** |
| Legacy vendors.type authoritative | **NO** |
| Vendor role financially authoritative | **NO** |
| Transaction category financially authoritative | **YES** |
| Vendor role + null category | **NEEDS_CLASSIFICATION** |
| Classification DB invariant | **PASS** |
| classified + null / labor / internal payroll | **DENIED** |
| Internal payroll direct-client bypass | **DENIED** |
| external_service / external_manpower | **YES** |
| Legacy labor for new entry | **NO** |
| Expense/AP shared taxonomy | **PASS** |
| Mixed AP end-to-end | **PASS** |
| Mixed AP recognition difference | **0.00** |
| Classification-only financial delta | **0.00** |
| Unknown costs dropped | **0** |
| Migration / targeted tests | **PASS** |
| Typecheck / Build | *(run in gate)* |

STOP — Owner SQL review only.
