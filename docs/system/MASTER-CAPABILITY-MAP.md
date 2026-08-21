# ProjectFlow — Master Capability Map (Post Refinement)

**Updated:** 2026-08-21 (Master Refinement — pre-Owner SQL closure)  
**Baseline audit:** same folder prior revision  
**Policy unchanged:** External public portal **OFF**. Not GL / not payroll.  
**Owner SQL:** migrations **0060–0061 NOT APPLIED** (ready for Owner review).

### Satellites

| Document | Role |
|----------|------|
| [`CLASSIFICATIONS-TAXONOMY-MAP.md`](./CLASSIFICATIONS-TAXONOMY-MAP.md) | Taxonomies including org catalogs |
| [`ENTITY-RELATIONSHIP-MAP.md`](./ENTITY-RELATIONSHIP-MAP.md) | Business chains |
| [`HIDDEN-PARTIAL-AND-IMPROVEMENTS.md`](./HIDDEN-PARTIAL-AND-IMPROVEMENTS.md) | Disposition of prior gaps |

### Product truths (still enforced)

Billing ≠ Payment · Commitment ≠ Actual · Progress ≠ Actual · VAT ≠ Profit · Retention = cash timing · Pending CO ≠ CCV · Approved CO → CCV · Visibility ≠ Permissions

---

## What changed in this refinement

### Organization business catalogs — COMPLETE

Kinds: `client_type`, `vendor_category`, `vendor_specialty`, `payment_term`, `cost_code`, `lead_source`, `lost_reason`, `engagement_role`  
Tables: `organization_catalog_entries`, `vendor_catalog_links`, `document_requirement_rules`  
Settings UI: `/settings/business-catalogs`  
Seeded on org create + business profile apply (`profile-catalog-seeds.ts`)  
**Integrity:** all catalog FKs use **ON DELETE RESTRICT**; in-use entries are **deactivated/archived**, never hard-deleted. DB triggers enforce kind correctness (`assert_catalog_entry_kind` + per-table kind checks).

**Existing-org seed (two paths, idempotent):**
1. **0060 SQL** — universal catalog keys + `default_payment_term_key = net_30` when unset (insert missing only; never overwrites customizations).
2. **Application** — `backfillExistingOrgBusinessCatalogs`: same universal seed + profile vocabulary via `applyBusinessProfileConfig(..., { catalogsOnly: true })` when org already has a business profile.

### Payment terms — COMPLETE

**Inheritance (create / defaulting only; posted due dates never rewritten):**

| Side | Precedence (first wins) |
|------|-------------------------|
| **AR** (billing) | billing explicit → contract → client default → org default (`default_payment_term_key`) |
| **AP** (vendor bill) | bill explicit → **subcontract** → PO → vendor default → org default |
| **Documents** (contract, subcontract, PO, party create) | explicit → party default → org default |

**AP rule:** when both subcontract and PO are linked, **subcontract wins** (commercial commitment over operational PO).

Due dates derived via `deriveDueDate` from catalog metadata; historical/user-entered due dates are never rewritten.

**PO:** `purchase_orders.payment_term_id` added (0060); inherits vendor → org when unset.

### Cost code attribution — COMPLETE (when `cost_codes_enabled`)

Optional catalog `cost_code_id` on: **budget lines**, **PO lines**, **expense allocations**, **AP bill lines**.  
**Cost Category** (`expense_allocations.cost_category_id`) is a separate taxonomy — not cost code.  
Variance view: **Budget vs Committed vs Actual** by catalog cost code (`getProjectCostCodeVariance`); unattributed actual tracked separately.

### Vendor / Client 360 — COMPLETE

Vendor: type + categories/specialties + identifiers + payment terms + engagements/subcontracts/AP/performance/docs  
Client: type + payment terms + sales/quotes + work + billing/timeline  
Inactive vs archive clarified in UI copy

### Global Contracts / Subcontracts — COMPLETE

Routes: `/contracts`, `/subcontracts` (compose existing engines; no duplicate)

### Quote architecture — MOSTLY COMPLETE / cleaned

Product Quote = customer commercial truth; CRM sales quote **creation deprecated**; legacy read-only  
Convert kinds: `project | job | work_order`

### Subcontract validation — COMPLETE

`supplier` requires explicit `promoteVendorToBoth`; `other` rejected; `subcontractor|both` OK

### Daily Log links — COMPLETE

`daily_log_vendors` / `_employees` / `_assets` (+ free-text retained)

### Approvals 2.0 — COMPLETE

Ordered steps on rules; **request steps are immutable snapshots** copied at submit (`approval_request_steps`); rule edits do **not** rewrite in-flight or historical requests. Advance/reject updates step status only; inbox shows current step. Domain lifecycles for Changes/BOQ/Time unchanged.

### Timesheet periods — COMPLETE

`/workforce/timesheets` · lock on approve (`locked_at`) · corrections via void+insert · not payroll

### Reports — COMPLETE (19 kinds total; 11 new fully functional)

**11 refinement-wave reports** (all wired in `generate-extended-reports.ts` with full builders, not stubs):

`client_360`, `vendor_360`, `contract_portfolio`, `subcontract_cash`, `labor_utilization`, `retention_schedule`, `inventory_movement`, `compliance_expiry`, `crm_funnel`, `month_close_completeness`, `safety_open_actions`

Plus 8 prior project/field kinds unchanged.

### Automations stubs — COMPLETE

`draft_expense` / `planning_followup` implemented when data+permissions allow; unsafe actions still blocked

### Inventory / ops bridges — COMPLETE (qty-first)

Transfers/adjust/reservations/counts UX; material/equipment usage → **explicit expense draft only** (migration **0061** — never auto Actual)

### Project access UX — COMPLETE

Org mode + selected grants read|manage on Team tab / people settings

### BOQ allocation kinds — COMPLETE

TS includes `lump_sum|reversal|correction`; UI offers user-facing kinds only

---

## Intentionally foundation / off

| Item | Status |
|------|--------|
| Public portal login | **DISABLED** (`isExternalPublicAccessEnabled()` → false; customer + vendor portal pages hard-block) |
| OCR live | Env-gated (unchanged) |
| Inventory costing / FIFO | Excluded |
| CPM Gantt | Foundation (`supported: false`) |
| Statutory invoicing | Unconfigured |
| Email/push product | Reserved |
| Payroll / GL | Out of scope |

---

## Migrations for Owner

| File | Purpose |
|------|---------|
| `0060_business_catalog_refinement.sql` | Catalogs, RESTRICT FKs, kind triggers, daily-log links, approval steps + request snapshots, timesheet lock, doc requirements, PO payment terms, cost-code columns, existing-org universal seed, RLS |
| `0061_ops_expense_usage_kinds.sql` | Allow `material_usage_record` / `equipment_usage_record` → expense **draft** link kinds only |

**Owner SQL applied = NO** (0060 and 0061 both pending)

---

## Evidence roots

`drizzle/schema/business-catalog.ts`, `drizzle/migrations/0060_business_catalog_refinement.sql`, `drizzle/migrations/0061_ops_expense_usage_kinds.sql`, `src/modules/business-catalog/**`, `src/modules/business-catalog/domain/resolve-payment-terms.ts`, `src/modules/budgets/application/cost-code-variance.ts`, `src/modules/tenancy/application/backfill-business-catalogs.ts`, `src/modules/tenancy/domain/profile-catalog-seeds.ts`, `src/modules/approvals/application/submit-and-gate.ts`, `src/modules/reports/application/generate-extended-reports.ts`, app routes `/contracts`, `/subcontracts`, `/settings/business-catalogs`, `/workforce/timesheets`, vendors/clients 360 UIs, approvals steps.
