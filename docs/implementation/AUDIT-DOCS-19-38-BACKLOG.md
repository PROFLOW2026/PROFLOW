# Audit — Docs 19–38 capability classification

**Auditor:** Auto AUDITOR B  
**Date:** 2026-08-09  
**Scope:** Future capability docs `19`–`38` vs local codebase (migrations through `0013` local; remote through `0008`).  
**Policy:** No push. Notifications (doc 26) = **DEFERRED BY OWNER**. Avoid RFQ / AP / offline / OCR thrash.

Legend: **IMPLEMENTED** · **PARTIAL** · **SAFE TO BUILD NOW** · **DEFERRED BY OWNER** · **REQUIRES EXTERNAL CREDENTIAL** · **REQUIRES PRODUCT DECISION** · **POST-LAUNCH**

---

## Classification table

| Doc | Capability | Status | Evidence / note |
|-----|------------|--------|-----------------|
| 19 | Future capability map (planning inventory) | IMPLEMENTED | Doc-only architecture inventory; not a build surface |
| 20 | CRM leads / prospects / contacts | PARTIAL | CRM module + UI; contact depth limited |
| 20 | Opportunities + pipeline stages | PARTIAL | Lifecycle usable; org-configurable stages not shipped |
| 20 | Sales quotes / versions / alternates | PARTIAL | Quotes + versions; public send / alternates thin |
| 20 | Estimates / site visits / follow-ups | PARTIAL | Estimates exist; site-visit / reminder UX thin |
| 20 | Won conversion → Client/Project/Contract | IMPLEMENTED | `convertWonOpportunity` + lead auto-status |
| 20 | Lost reasons | PARTIAL | Domain support; polish remains |
| 21 | RFQ / supplier quote comparison | PARTIAL | Wave 3 WIP — **do not thrash** (other agents) |
| 21 | Purchase Orders + committed cost ≠ expense | PARTIAL | Schema + module; remote migration pending |
| 21 | Materials catalog + historical prices | PARTIAL | Foundations; price history depth later |
| 21 | Inventory / warehouse / issues-returns | PARTIAL | Schema/module in progress — avoid thrash |
| 22 | Layer A: project / WP / phase dates + progress % | PARTIAL | Dates/progress exist; phase/WP date UI was thin |
| 22 | Layer A: milestones | PARTIAL | CRUD + achieve; missed/cancelled UI was missing |
| 22 | Layer B: Gantt / critical path / resource scheduling | POST-LAUNCH | Explicit Later / optional |
| 22 | Layer C: daily logs / punch / inspections / handover | PARTIAL | Field-ops module started — avoid thrash |
| 23 | Asset registry / checkout / usage | PARTIAL | Assets module started — avoid thrash |
| 23 | Fleet true cost / cost per distance | POST-LAUNCH | Needs product depth + cost allocation UX |
| 23 | Maintenance schedules / meter-based | PARTIAL | Maintenance surface started — avoid thrash |
| 24 | Insurance policies + renewal tracking | PARTIAL | Compliance registry usable; renewal alerts → doc 26 |
| 24 | Licenses / certifications / polymorphic requirements | PARTIAL | Artifacts + subject pickers; Country Pack catalogs later |
| 25 | Customer portal (grants + safe projection) | PARTIAL | Grants + summary/docs/billing preview + IDOR tests; public login deferred |
| 25 | Vendor / subcontractor portal | PARTIAL | Vendor-scoped RFQ/PO + candidates ≠ ledger; public login deferred |
| 25 | E-signature | POST-LAUNCH | Integration Later |
| 26 | In-app + email notifications | DEFERRED BY OWNER | Explicit owner deferral |
| 26 | SMS / WhatsApp / push | DEFERRED BY OWNER | Channels blocked with notifications |
| 26 | Automations / digests / escalation | DEFERRED BY OWNER | Depends on notification platform |
| 27 | OCR / CaptureJob review flow | PARTIAL | Stub provider; human confirm path exists |
| 27 | Live OCR extraction | REQUIRES EXTERNAL CREDENTIAL | Needs real provider key/adapter |
| 27 | AI financial intelligence / assistant | POST-LAUNCH | Research / Later |
| 28 | Richer AR (aging, credits, retention) | PARTIAL | AR summary / payment history / credit-void disclosure |
| 28 | Full AP + PO matching | PARTIAL | AP module — avoid thrash |
| 28 | Cash-flow Actual vs Forecast | IMPLEMENTED | Org + project cash views |
| 28 | Accounting connectors | REQUIRES PRODUCT DECISION | Provider + mapping choices open |
| 29 | Project / org financial summaries | IMPLEMENTED | Reports + project financial panels |
| 29 | Historical intelligence / comparisons | POST-LAUNCH | Needs taxonomy + history volume |
| 29 | Configurable BI / saved widgets | POST-LAUNCH | Later |
| 29 | CSV / Excel / PDF exports | PARTIAL | CSV exports usable; Excel/PDF later |
| 30 | Israel Country Pack + Hebrew UI + tax ladder | IMPLEMENTED | V1 pack direction shipped |
| 30 | Additional country packs | POST-LAUNCH | Later |
| 30 | Multi-currency conversion | POST-LAUNCH | Later; FX exclusion disclosed today |
| 30 | Extra locales / terminology packs | SAFE TO BUILD NOW | Controlled terminology overrides (no new countries) |
| 31 | Responsive web field flows | PARTIAL | Mobile-friendly surfaces; not all flows tuned |
| 31 | PWA / offline drafts | PARTIAL | Offline module foundations — **avoid thrash** |
| 31 | Native mobile apps | POST-LAUNCH | Research / Later |
| 32 | API keys + whoami | IMPLEMENTED | Settings UI + Bearer whoami |
| 32 | Webhooks (endpoints + delivery worker) | PARTIAL | Enqueue/test foundation; worker not productized |
| 32 | OAuth / payroll / maps / e-sign connectors | POST-LAUNCH | Later integrations |
| 33 | MFA / SSO / SCIM / legal hold / regional hosting | POST-LAUNCH | Enterprise Later |
| 33 | Audit export / retention policies | SAFE TO BUILD NOW | Export existing audit log (no new schema) |
| 34 | Legal / accounting / consulting vertical packs | POST-LAUNCH | Flexibility only; not V1 build |
| 35 | Module visibility preferences | IMPLEMENTED | Settings features panel + auto-surface |
| 35 | Org domains / services / cost categories | IMPLEMENTED | Business settings catalogs |
| 35 | Governed custom fields | PARTIAL | Definitions + client/project values; more entities later |
| 35 | Status / notification rule builders | DEFERRED BY OWNER | Notification rules tied to doc 26 |
| 36 | Profession presets (apply) | PARTIAL | Apply works; preview was missing |
| 36 | Project structure templates | PARTIAL | Domain + apply use-case existed; UI missing |
| 36 | Quote / CR / employee cost template libraries | SAFE TO BUILD NOW | After CRM/commercial owners free those files |
| 37 | Structured CSV import wizard | IMPLEMENTED | Clients/vendors/employees/projects |
| 37 | Broader financial history import | REQUIRES PRODUCT DECISION | Mapping rules for messy ledgers |
| 37 | CSV entity exports | IMPLEMENTED | Permission-gated `/exports/[kind]` |
| 37 | Full account export / Excel / PDF packs | POST-LAUNCH | Portability suite later |
| 38 | ProjectFlow SaaS subscription billing | REQUIRES PRODUCT DECISION | Packaging (`K1`) undecided; separate BC |
| 38 | SaaS billing provider adapters | REQUIRES EXTERNAL CREDENTIAL | After packaging decision |

---

## SAFE TO BUILD NOW — ranked

| Rank | Item | Doc | Why safe / high value | Owner risk |
|------|------|-----|------------------------|------------|
| 1 | Milestone missed / cancelled / reopen UI | 22 | Status already in domain + action; UI gap only | Low — projects module |
| 2 | Phase create + WP start/end date edit on Work tab | 22 | Application layer exists; wire forms | Low — projects module |
| 3 | Apply project structure template UI | 36 | `applyProjectTemplate` + catalog already exist | Low — projects module |
| 4 | Wire progressive workspace overview links | 45 / 22 | `selectProjectWorkspaceLinks` unused | Low — projects overview |
| 5 | Profession preset contents preview before apply | 36 | Read-only catalog preview | Low — settings business |
| 6 | Audit log CSV export from settings | 33 / 37 | Reuses audit read + export patterns | Medium — coordinate exports |
| 7 | Custom field values on more entities (vendor/employee) | 35 | Definitions already governed | Medium — shared panels |
| 8 | Webhook endpoint revoke + delivery status UI | 32 | Schema present; no worker required for revoke | Medium — api module |
| 9 | Controlled terminology display overrides | 30 | Keys exist; org override UI | Medium — i18n/shared |
| 10 | Quote / CR template starters | 36 | Needs commercial/CRM file calm | Higher — wait for other agents |

**Explicitly not in this auditor’s build queue:** RFQ, AP matching, inventory, offline SW, OCR providers, notifications.

---

## Implemented this audit pass

1. Milestone missed / cancelled / reopen actions (+ StatusBadge) in milestones panel  
2. Work-tab phase create + work-package start/end/progress schedule form  
3. Wired project structure template apply UI on simple (unsplit) projects  
4. Wired progressive workspace links + schedule summary on project overview  
5. Profession preset contents preview before apply (settings → business)  

Parallel work already had domain helpers (`scheduling`, `templates`, `workspace-links`) and several UI shells; this pass closed the wiring gaps above.

---

## Residual / owner

- Apply remote migrations `0009`–`0013` before push of dependent Wave 2/3 code  
- Doc 26 remains deferred  
- SaaS packaging (`38` / `K1`) needs an owner decision before any subscription schema  
