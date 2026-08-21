# Classifications / Taxonomy Map — Post Refinement

**Parent:** [`MASTER-CAPABILITY-MAP.md`](./MASTER-CAPABILITY-MAP.md)  
**Updated:** 2026-08-21 (pre-Owner SQL closure)  
**Owner SQL:** 0060–0061 **NOT APPLIED**

## Organization-managed catalogs

| Kind | Mode | UI | Seeded | Notes |
|------|------|-----|--------|-------|
| client_type | D org catalog | Settings → Business catalogs | Universal defaults (0060 SQL + app seed) | Optional on client |
| vendor_category | D + M2M links | Settings + vendor form | Profile seeds | Affinity metadata optional |
| vendor_specialty | D + parent category | Settings + vendor form | Profile seeds | `parent_id` → category; DB trigger enforces parent kind |
| payment_term | D + metadata strategy | Settings + client/vendor/contract/subcontract/PO/billing/AP | Universal | `deriveDueDate`; see inheritance below |
| cost_code | D optional | Settings; line-level FKs | Profile when relevant | Gated by `cost_codes_enabled` setting |
| lead_source | D | Settings + CRM | Universal | free-text retained |
| lost_reason | D | Settings + CRM | Universal | free-text retained |
| engagement_role | D | Settings + engagements | Universal | free-text role retained |

### Catalog lifecycle policy

- **Deactivate/archive:** set `is_active = false` + `archived_at` via Settings UI (`deactivateBusinessCatalogEntry`). Historical references remain valid.
- **No hard delete when referenced:** all catalog FKs use **ON DELETE RESTRICT** (0060). DB rejects delete of in-use entries.
- **Kind integrity:** `app.assert_catalog_entry_kind` + per-table triggers (clients, vendors, engagements, payment-term refs, CRM, cost-code refs, vendor links, doc requirements) enforce `(id, organization_id, kind)` match at write time.

### Existing-org seed

| Path | Behavior |
|------|----------|
| **0060 SQL** | Idempotent `INSERT … WHERE NOT EXISTS` for universal keys; sets `default_payment_term_key = net_30` when unset |
| **`backfillExistingOrgBusinessCatalogs`** | App companion: universal seed + org default key + profile vocab via `catalogsOnly: true` (does not change profile selection) |

Safe to re-run either path.

## Payment term inheritance

Org default is the **`default_payment_term_key`** organization setting (catalog key, e.g. `net_30`) → resolved to catalog entry id at runtime.

| Context | Resolution |
|---------|------------|
| Contract / Subcontract / PO (create) | explicit `payment_term_id` → party default → org default |
| Billing (AR) | explicit → contract → client default → org default |
| AP bill | explicit → subcontract → **PO** → vendor default → org default |

**AP precedence note:** subcontract wins over PO when both are linked.

Stored due dates and explicit term ids on posted documents are **never rewritten** when masters or defaults change.

## Cost code vs cost category

| Concept | Source | Used on |
|---------|--------|---------|
| **Cost Code** | Org catalog (`kind = cost_code`) | Budget lines, PO lines, expense allocations, AP bill lines (`cost_code_id`) |
| **Cost Category** | Separate expense taxonomy | Expense allocations (`cost_category_id`) only |

These are intentionally distinct. Cost-code variance rolls up **Budget vs Committed vs Actual** by catalog cost code; cost category is not part of that view.

## Still hardcoded (correct)

Status lifecycles, billing kinds, vendor **type** enum (`supplier|subcontractor|both|other`), cost families, approval entity types, notification events, etc. — unchanged principle.

## Vendor type vs category

- `vendor.type` = primary classification (kept)
- Categories/specialties = business vocabulary under type
- Same company can be `both` + multiple categories
