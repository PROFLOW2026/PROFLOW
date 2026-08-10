# Overnight / PRE-SQL — known limitations

**Status:** post-0020 activation (owner applied migration)  
**Release:** NOT until owner manual test  
**0020:** applied by owner — **IMMUTABLE** (next delta = 0021+)  

## Persistence readiness (ON after owner migrate)

| Module | Flag | Production |
|--------|------|------------|
| AP payments | `AP_PAYMENTS_PERSISTENCE_READY` | **Drizzle** |
| Banking | `BANKING_PERSISTENCE_READY` | **Drizzle** (CSV/XLSX; no live feed) |
| Planning | `PLANNING_PERSISTENCE_READY` | **Drizzle** |
| OCR metadata | `OCR_PERSISTENCE_READY` | **Drizzle** |
| Ops→Finance | `OPS_FINANCE_PERSISTENCE_READY` | **Drizzle** |
| Invoicing metadata | `INVOICING_INTEGRATION_PERSISTENCE_READY` | **Drizzle** metadata only |
| Portal candidates | `PORTAL_CANDIDATES_PERSISTENCE_READY` | **Drizzle** |

In-memory / test-double stores remain **TEST DOUBLE ONLY**.

## External services (still honestly disabled)

- Azure OCR live HTTP (`AZURE_OCR_LIVE_HTTP_READY=false` → `configured_pending`)
- External statutory invoicing provider (unconfigured / disabled issuance)
- Live bank feed (CSV/XLSX only)
- Public customer/vendor portal authentication (DISABLED)

## Planning

- Critical Path: foundation only (`supported: false`)
- Jobs remain opt-out of planning complexity

## Portal visibility defaults

- `project_milestones.portal_visible` / `document_links.portal_visible` default **false**
