# Hidden / Partial / Improvements — Disposition after Refinement

**Parent:** [`MASTER-CAPABILITY-MAP.md`](./MASTER-CAPABILITY-MAP.md)  
**Updated:** 2026-08-21 (pre-Owner SQL closure)  
**Owner SQL:** 0060–0061 **NOT APPLIED**

## Prior 25 hidden/underused — disposition

| # | Item | Disposition |
|---|------|-------------|
| 1 | CRM sales quotes | **Deprecated create**; Product Quote path; legacy read-only |
| 2 | Vendor tier/parent | Still simple fields; categories now primary taxonomy |
| 3 | Vendor identifiers UI | **Completed** |
| 4 | Multi-contract UX | Discoverability + global `/contracts` |
| 5 | Contract adjustment kind | Foundation retained |
| 6 | BOQ reversal/correction | **TS+UI coverage closed** (system kinds not free-pick) |
| 7 | BOQ sub schedules | Advanced path retained |
| 8 | AP allocations | Surfaced on AP detail |
| 9 | Expense allocation schedules | Power-user retained |
| 10 | Labor month costs | Retained; cost-gated |
| 11 | Inventory reservations/counts | **UX completed** |
| 12 | Material/equipment usage | **Explicit expense draft bridge** (0061; draft only, never auto Actual) |
| 13 | Project access grants | **UX completed** |
| 14 | Portal grants | Foundation; public login **OFF** |
| 15 | API/webhooks | Foundation retained |
| 16 | Banking live feed | Foundation retained; match non-mutating |
| 17 | Statutory invoicing | Unconfigured retained |
| 18 | Assistant LLM | Unconfigured retained |
| 19 | Automation stubs | **Completed** (safe paths) |
| 20 | Unused-capability tips | **Tuned** |
| 21 | portalVisible | Portal OFF |
| 22 | Recurring drafts | Discoverability tip |
| 23 | Sales hub | Product Quote clarified |
| 24 | WO billing sources | Shared AR retained |
| 25 | Saved views | Present; polish ongoing |

## Formerly missing — now present

| Area | Status |
|------|--------|
| Payment term inheritance (org → party → document → AR/AP) | **Complete** — incl. PO `payment_term_id`; AP subcontract-over-PO rule |
| Client / vendor types & categories | **Complete** |
| Cost code catalog + line attribution | **Complete** when `cost_codes_enabled`; variance Budget/Committed/Actual |
| Global contracts / subcontracts | **Complete** |
| Quote → WO convert | **Complete** |
| Timesheet period product | **Complete** |
| Approvals multi-step + immutable request snapshots | **Complete** |
| 11 expanded reports | **Fully functional** (not stubs) |
| Document requirements framework | **Complete** |
| Catalog RESTRICT FKs + deactivate policy | **Complete** (0060) |
| Existing-org catalog backfill | **Complete** — 0060 SQL + `backfillExistingOrgBusinessCatalogs` |

## Refinement-wave reports (all functional)

`client_360`, `vendor_360`, `contract_portfolio`, `subcontract_cash`, `labor_utilization`, `retention_schedule`, `inventory_movement`, `compliance_expiry`, `crm_funnel`, `month_close_completeness`, `safety_open_actions`

## Owner SQL pending

| Migration | Blocks until applied |
|-----------|---------------------|
| **0060** | Catalog tables/columns, payment-term FKs, cost-code columns, approval steps, daily-log links, universal seed |
| **0061** | Material/equipment usage → expense draft link kinds |

Application code and schema TS reflect post-0060/0061 shape; **Owner production DB has not received these migrations.**

## Still intentional exclusions

GL · Payroll · Inventory costing · CPM · Public portal · Auto-pay/finalize/approve automations · Usage → expense without explicit user action (draft bridge only)
