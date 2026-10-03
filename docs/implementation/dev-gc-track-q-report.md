# Track Q — Procurement / award / closeout / warranty / performance (completion report §0.6)

Per `docs/implementation/dev-gc-track-briefs.md` §0.6. WIP SQL **not** applied to any shared database.

## 1. Files created/changed

**Schema / SQL**

- `drizzle/schema/dg-procurement-closeout.ts` — Track Q tables (Drizzle mirror)
- `drizzle/migrations-wip/0167_dg_procurement_closeout.sql` — idempotent migration + RLS

**Modules**

- `src/modules/contractor-procurement/**` — tender packages, invitations, offers (+ financial projection table), award → `createDraftAgreement`
- `src/modules/contractor-closeout/**` — per-agreement closeout checklist, portal handover, warranty reports + `entity_links` to defects
- `src/modules/contractor-performance/**` — factual `q-v1` metrics snapshots (no AI score)

**Routes**

- Internal: `tenders`, `tenders/[packageId]`, `contractor-closeout`, `contractor-warranty` under `src/app/[locale]/(app)/projects/[projectId]/`
- Portal: `(portal)/projects/[projectId]/tenders`, `.../handover`
- `src/modules/contractor-portal/domain/routes.ts` — `project.tenders` + `project.handover` → `implemented: true`

**Registry (track slot)**

- `src/shared/domain-events/events/procurement.ts`
- `src/shared/entity-access/resolvers/procurement.ts`
- `src/shared/audit/dg/procurement.ts`

**Locales (4)**

- `src/locales/{he-IL,en,ar,ru}/awards.json`, `handover.json`

**Tests**

- `tests/setup/dg-fixtures-procurement.ts`
- `tests/integration/dg-procurement/tenders.test.ts` (bidder A/B isolation + award → draft agreement)
- `tests/unit/procurement/closeout-rules.test.ts`, `performance-metrics.test.ts`

## 2. WIP SQL (`0167_dg_procurement_closeout.sql`) — summary

| Table | Purpose |
|-------|---------|
| `contractor_tender_packages` | Trade + scope; award → vendor + draft agreement |
| `contractor_tender_invitations` | Candidate vendors |
| `contractor_tender_offers` | Operational bid row (no money) |
| `contractor_tender_offer_financials` | Bid amount (internal `contract.financial.view`; contractor write on submit) |
| `subcontract_agreement_closeouts` | One closeout per subcontract agreement |
| `subcontract_closeout_checklist_items` | Required handover items + waive/override path |
| `contractor_warranty_reports` | Warranty issues; defects linked via `entity_links` only |
| `contractor_performance_snapshots` | Documented factual metrics JSON |

RLS: `app.has_project_capability` (internal), `app.external_has_scope` (`ext.bid.submit`, `ext.handover.submit`), `service_role` all-policies.

Reuses existing `warranty_coverages` (optional FK on reports). Does **not** touch customer quote / org procurement RFQ tables.

## 3. Use-cases, actions, routes, UI

| Surface | Routes | Key APIs |
|--------|--------|----------|
| Internal | `/projects/[projectId]/tenders`, `tenders/[packageId]`, `contractor-closeout`, `contractor-warranty` | `listProjectTenderPackages`, `getTenderPackageDetail`, `createTenderPackage`, `inviteVendorToTender`, `awardTenderToSubcontract`, `listProjectAgreementCloseouts`, `ensureAgreementCloseout`, `closeAgreementWithChecklist`, `listProjectWarrantyReports`, `reportWarrantyIssue`, `computeAgreementPerformanceSnapshot` |
| Portal | `/contractor/projects/[projectId]/tenders`, `.../handover` | `listPortalTenders`, `submitContractorBid`, `getPortalHandover`, `submitHandoverChecklistItem` |

Award path calls `@/modules/subcontracts` **`createDraftAgreement`** only (DRAFT status).

## 4. Events, resolvers, audit

- Events: `procurement.tender.awarded`, `closeout.agreement.closed`, `warranty.claim.reported` (`PROCUREMENT_DOMAIN_EVENTS`)
- Resolvers: `tender_package`, `agreement_closeout`, `contractor_warranty_report`
- Audit: `tender_package.created`, `tender_offer.submitted`, `tender_package.awarded`, `agreement_closeout.closed`, `handover_item.submitted`, `warranty_report.reported`

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0167_dg_procurement_closeout.sql'
npx vitest run tests/unit/procurement/closeout-rules.test.ts tests/unit/procurement/performance-metrics.test.ts tests/integration/dg-procurement/tenders.test.ts
```

- **4 tests — all pass** (2026-10-03 local PGlite with WIP 0167).

Note: `tests/unit/contractor-portal/routes.test.ts` case “returns null hrefs for routes that are not implemented” may fail when **all** portal routes are implemented (Track Q was the last `implemented: false` pair). See requests below.

## 6. REQUESTS TO MAIN AGENT

- Wire **Owner/Employee project nav** to `tenders`, `contractor-closeout`, `contractor-warranty` (Track S/U).
- Add dedicated project capabilities (e.g. `tender.manage`, `closeout.manage`) if finer control is desired; Track Q uses `contract.manage`, `contractor.coordinate`, `project.view` today.
- **settings.activity.actions** labels for new `PROCUREMENT_AUDIT_ACTIONS` in 4 locales.
- Update `tests/unit/contractor-portal/routes.test.ts` to skip or adapt the “not implemented” example when no stub routes remain.
- Promote `drizzle/migrations-wip/0167_dg_procurement_closeout.sql` → `drizzle/migrations/` (**separate SQL approval**).
- Performance snapshot input collectors: wire ports from tasks (G), defects (MN), RFI (KL), compliance (P), inspections (MN) when query exports exist.

## 7. Known gaps

*(empty — Track Q scope for this wave complete; nav wiring and performance port wiring listed as requests, not product gaps.)*
