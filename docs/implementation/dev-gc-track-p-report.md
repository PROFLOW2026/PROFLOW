# Track P — Contractor compliance / safety / deliveries (completion report §0.6)

Per `docs/implementation/dev-gc-track-briefs.md` §0.6. WIP SQL **not** applied to any shared database.

## 1. Files created/changed

**New (this pass — routes, UI, locales, tests)**

- Internal routes: `src/app/[locale]/(app)/projects/[projectId]/contractor-compliance/page.tsx`, `site-safety/page.tsx`, `deliveries/page.tsx`
- Portal routes: `src/app/[locale]/contractor/(portal)/projects/[projectId]/compliance/page.tsx`, `deliveries/page.tsx`, `safety/page.tsx`
- `src/modules/contractor-compliance/actions/*`, `ui/compliance-agreement-list.tsx`, `compliance-review-actions.tsx`, `contractor-submit-form.tsx`, `apply-standard-set-button.tsx`
- `src/modules/deliveries/actions/*`, `ui/delivery-create-form.tsx`, `contractor-delivery-forms.tsx`
- `src/modules/safety/contractor/actions/*`, `ui/safety-report-form.tsx`
- `src/locales/{he-IL,en,ar,ru}/contractorCompliance.json`, `deliveries.json` (filled)
- `tests/integration/dg-compliance/deliveries.test.ts`, `safety.test.ts`
- `src/modules/contractor-portal/domain/routes.ts` (P portal routes `implemented: true`)

**Unchanged (prior work — not rewritten)**

- `src/modules/contractor-compliance/**` application/data/domain (except new actions/ui)
- `src/modules/deliveries/**` application/data/domain
- `src/modules/safety/contractor/**` application/repository/domain (except new actions/ui)
- `drizzle/migrations-wip/0166_dg_compliance_safety_materials.sql`, `drizzle/schema/dg-compliance-safety.ts`
- `tests/setup/dg-fixtures-compliance.ts`, `tests/integration/dg-compliance/compliance.test.ts`, `tests/unit/compliance/**`

## 2. WIP SQL (`0166_dg_compliance_safety_materials.sql`) — summary

Tables: `contractor_compliance_requirements`, `contractor_compliance_documents`, `contractor_compliance_reminders`, `delivery_items`, `delivery_item_reports`, `safety_record_contractor_links` (+ reuse of existing `safety_records` / compliance artifacts where applicable).

Functions/triggers: append-only / immutability on submissions and reports, external update guards on deliveries, expiry scan support, RLS via `app.has_project_capability` and `app.external_has_scope`.

## 3. Use-cases, actions, routes, UI

| Surface | Routes | Entrypoints |
|--------|--------|-------------|
| Internal | `/projects/[projectId]/contractor-compliance`, `site-safety`, `deliveries` | `getProjectComplianceOverview`, review/standard-set actions; `listContractorSafety`, `reportContractorSafety`; `listProjectDeliveries`, `createProjectDelivery` |
| Portal | `/contractor/projects/[projectId]/compliance`, `deliveries`, `safety` | `getContractorCompliance`, `submitContractorComplianceDocument`; `listDeliveriesForPortal`, `createDeliveryFromPortal`, `reportDeliveryFromPortal`; `listContractorSafetyForPortal`, `reportSafetyFromPortal` |

**Track F port:** `getPaymentEligibilityInputs` exported from `@/modules/contractor-compliance` (implemented query port, not a stub).

## 4. Events, resolvers, audit

- Events: `src/shared/domain-events/events/compliance.ts` (`compliance.document.*`, `safety.record.*`, `delivery.item.*`).
- Entity resolver: `src/shared/entity-access/resolvers/compliance.ts` (`compliance_document`).
- Audit: `src/shared/audit/dg/compliance.ts` merged in `src/shared/audit/actions.ts`.
- Command Center: `listExpiringComplianceForOrg`, `listDelayedDeliveriesForOrg` ports in `src/modules/command-center/data/dg-ports.ts`.

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0166_dg_compliance_safety_materials.sql'
npx vitest run tests/unit/compliance tests/integration/dg-compliance
```

- **6 files / 18 tests — all pass** (2026-10-03 local run with `PF_WIP_FILES=0166_dg_compliance_safety_materials.sql`).
- Unit (10): `tests/unit/compliance/status.test.ts` (7), `evidence.test.ts` (3).
- Integration (8): compliance (5) incl. contractor A/B, payment eligibility, expiry scan; `migration-smoke` (1); `deliveries.test` (1) A/B; `safety.test` (1) A/B.

## 6. REQUESTS TO MAIN AGENT

- Wire **Owner/Employee project nav** and **Employee hub** to `contractor-compliance`, `site-safety`, `deliveries` (Track S/U).
- Add **settings.activity.actions** labels for `COMPLIANCE_AUDIT_ACTIONS` / delivery audit keys in 4 locales if not generated from registry.
- Promote `drizzle/migrations-wip/0166_dg_compliance_safety_materials.sql` → `drizzle/migrations/` when ready (**separate SQL approval**).

## 7. Known gaps

*(empty — Track P product scope complete for this wave; nav wiring listed above as requests, not gaps.)*
