# Track MN final report (inspections + defects / quality)

Registry key: `quality` · Migration WIP: `drizzle/migrations-wip/0164_dg_inspections_defects.sql`

**MIGRATION APPLIED = NO** — prepared for Owner review only; PGlite tests use `PF_WIP_FILES=0164_dg_inspections_defects.sql`.

## 1. Files created/changed

**Module (Track MN owns)**

- `src/modules/inspections/**` — domain, data, application (existing); **new** `ui/actions.ts`, `ui/inspection-list.tsx`, `ui/inspection-create-form.tsx`, `ui/inspection-workspace.tsx`
- `src/modules/defects/**` — domain, data, application (existing); **new/extended** `ui/form-controls.tsx`, `ui/defect-list.tsx`, `ui/defect-create-form.tsx`, `ui/defect-manage-panel.tsx`, `ui/contractor-defect-panel.tsx`, `ui/cycle-history.tsx` (actions/form-state/tones existed)
- `drizzle/schema/dg-quality.ts` — mirrors WIP SQL (pre-existing)
- `src/locales/{he-IL,en,ar,ru}/inspections.json`, `defects.json` — full namespaces (pre-existing; registered in `src/shared/i18n/config.ts`)
- `tests/integration/dg-quality/**`, `tests/unit/dg-quality/**` — append-only assertions aligned with PGlite error wrapping (claims-track pattern)

**Routes (Track MN)**

- Internal: `src/app/[locale]/(app)/projects/[projectId]/inspections/page.tsx`, `.../inspections/[inspectionId]/page.tsx`, `.../defects/page.tsx`, `.../defects/[defectId]/page.tsx`
- Portal: `src/app/[locale]/contractor/(portal)/projects/[projectId]/inspections/page.tsx`, `.../defects/page.tsx`, `.../defects/[defectId]/page.tsx`
- Portal registry: `src/modules/contractor-portal/domain/routes.ts` — MN routes marked `implemented: true`

**Shared slots (pre-existing, verified)**

- `src/shared/domain-events/events/quality.ts`, registry import
- `src/shared/entity-access/resolvers/quality.ts` — `inspection`, `defect`
- `src/shared/audit/dg/quality.ts` — `AUDIT_ACTIONS`

## 2. WIP SQL (`0164_dg_inspections_defects.sql`)

**Tables:** `quality_inspection_templates`, `quality_inspection_template_items`, `quality_inspections`, `quality_inspection_items`, `quality_inspection_outcomes`, `defects`, `defect_cycle_records`

**Functions / triggers:** `app.quality_append_only`, `app.defects_transition_guard`, `app.defects_external_update_guard`; RLS on all quality tables; external read scoped to contractor-visible rows and grants (`ext.inspection.view`, `ext.defect.work`).

**Not applied** — prepared for Owner review only.

## 3. Use-cases, actions, routes, components

| Capability | Entry |
|---|---|
| Inspections | `createInspection`, `updateInspection`, `startInspection`, `saveChecklistResults`, `recordInspectionOutcome`, `startReinspection`, `cancelInspection`; reads `listProjectInspections`, `getInspectionDetail`, `listContractorInspections` |
| Defects | `createDefect`, `assignDefect`, `submitDefectCompletion` / internal completion, `startDefectVerification`, `verifyDefect`, `reopenDefect`, `cancelDefect`; reads `listProjectDefects`, `getDefectDetail`, `listDefectsAwaitingVerification`, contractor list/detail/summary |
| Server actions | `src/modules/inspections/ui/actions.ts`, `src/modules/defects/ui/actions.ts` |
| UI | `<InspectionList>`, `<InspectionCreateForm>`, `<InspectionWorkspace>`, `<DefectList>`, `<DefectCreateForm>`, `<DefectManagePanel>`, `<ContractorDefectPanel>`, `<DefectCycleHistory>` |
| Evidence / discussion | Entity types `inspection`, `defect` on detail pages (Track I stubs + Track G discussion) |

## 4. Events, resolvers, audit

Registered pre-existing: `quality.inspection.*`, `defect.item.*` domain events; entity resolvers `inspection`, `defect`; audit actions `quality_inspection.*`, `defect.*`.

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0164_dg_inspections_defects.sql'
npx vitest run tests/integration/dg-quality/migration.test.ts tests/unit/dg-quality
# 2 + 15 tests — PASS

npx vitest run tests/integration/dg-quality/quality.test.ts --testTimeout=120000
# PASS: catalog create, failed inspection + append-only outcomes
# TIMEOUT (local PGlite, 120–300s): contractor A/B isolation, full repair-cycle scenario — investigate DB reset / clone contention when prior vitest processes are killed mid-run
```

Log: `docs/audits/.mn-quality-test.log` (latest verbose run).

## 6. REQUESTS TO MAIN AGENT

1. **Project workspace nav** — Point `src/modules/projects/domain/workspace-links.ts` `inspections` (and add `defects`) to `/projects/{projectId}/inspections` and `/projects/{projectId}/defects` instead of legacy `/field-ops/...`.
2. **Owner project shell nav** — Add Quality section links (inspections + defects) where other track routes are listed (if not already generated from a central route table).
3. **Evidence UI (Track I)** — When `<EvidenceGallery>` / `<EvidenceUploader>` are implemented, MN detail pages already pass frozen props for `inspection` and `defect`.

## 7. Known gaps

- Integration file `quality.test.ts`: contractor isolation and full lifecycle cases **must pass in CI**; local runs timed out after earlier vitest kills — re-run clean on CI or single-process preflight.
- Legacy **field-ops** inspections UI remains for org-wide field ops; MN project routes use `quality_inspections` / `defects` tables (intentional dual surface until MAIN AGENT retires or redirects field-ops links).
