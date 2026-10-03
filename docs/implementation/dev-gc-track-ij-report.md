# Track IJ final report (documents / evidence / plans)

Registry key: `documents` · Migration WIP: `drizzle/migrations-wip/0162_dg_documents_plans.sql`

## 1. Files created/changed

**Evidence (Track IJ owns)**

- `src/modules/evidence/**` — use-cases (pre-existing), `actions.ts`, `routes.ts`, real `ui/` (`EvidenceGallery`, `EvidenceUploader`)
- `src/app/api/dg-files/**` — internal upload/download (evidence, drawing revision)
- `src/app/api/contractor/dg-files/**` — contractor upload/download (evidence, revision, shared document)

**Project plans (Track IJ owns)**

- `src/modules/project-plans/**` — application/data/domain (pre-existing), `routes.ts`, `actions/*`, `ui/*`
- Internal routes: `src/app/[locale]/(app)/projects/[projectId]/plans/page.tsx`, `.../plans/[drawingId]/page.tsx`
- Portal routes: `src/app/[locale]/contractor/(portal)/projects/[projectId]/documents/page.tsx`, `.../plans/page.tsx`, `.../plans/[drawingId]/page.tsx`

**Locales**

- `src/locales/{he-IL,en,ar,ru}/projectPlans.json` — full namespace (evidence strings nested under `projectPlans.evidence`)

**Tests**

- `tests/integration/dg-documents/*` — PGlite + RLS (7 scenarios; revoke/tamper split across transactions)
- `tests/unit/dg-documents/i18n.test.ts`, `tests/unit/dg-documents/revisions.test.ts`

**Shared slots (Track IJ owns per brief §0.2)**

- `src/shared/domain-events/events/documents.ts` (pre-existing)
- `src/shared/entity-access/resolvers/documents.ts` (pre-existing)
- `src/shared/audit/dg/documents.ts` (pre-existing)

## 2. WIP SQL (`0162_dg_documents_plans.sql`)

- `evidence_items` — attachments linked to entities; internal + external upload actors; visibility
- `document_shares` + `document_share_acknowledgements` — contractor sharing without file copies; revoke final
- `drawings`, `drawing_revisions`, `drawing_distribution_entries`, `drawing_revision_acknowledgements` — register; publish supersedes current
- RLS: `documents.view` / `documents.share` (internal); `ext.document.*` / `ext.plan.*` (external); contractor A/B isolation on shares and evidence
- Immutability triggers on shares, acknowledgements, published revisions

**Not applied** — prepared for Owner review only.

## 3. Use-cases, actions, routes, components

| Capability | Entry |
|---|---|
| Evidence | `listEvidence`, `countEvidence`, begin/complete upload (internal + external), open/remove |
| Drawings | `createDrawing`, revision upload/publish (supersede), distribution, archive |
| Sharing | `shareDocumentWithContractors`, `revokeDocumentShare`, contractor list/ack/open |
| Portal | `listContractorPlans`, `getContractorDrawing`, `listContractorSharedDocuments`, `getContractorPlansPortalSummary` |
| Frozen UI | `<EvidenceGallery>`, `<EvidenceUploader>` |
| Internal UI | `DrawingsRegister`, `DrawingCreateForm`, `RevisionUploadForm` |
| Portal UI | `ContractorPlansList`, `ContractorDrawingDetailPanel`, `ContractorDocumentsList` |

Domain events: `evidence.item.*`, `document.item.shared`, `document.share.*`, `plan.revision.published`, `plan.revision.acknowledged`, `plan.drawing.created`, `plan.distribution.updated`.

## 4. Events, resolvers, audit

- Registered via `DOCUMENTS_DOMAIN_EVENTS` in domain-events registry
- Entity resolvers: `drawing`, `drawing_revision`, `shared_document` in `DOCUMENTS_ENTITY_RESOLVERS`
- Audit actions via `DOCUMENTS_AUDIT_ACTIONS` / `AUDIT_ACTIONS.*`

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0162_dg_documents_plans.sql'
npx vitest run tests/integration/dg-documents tests/unit/dg-documents
npx vitest run tests/unit/contractor-portal/routes.test.ts
```

- Integration: **8/8 pass** (migration shape + 7 evidence/sharing/plans flows incl. contractor A/B, supersede, distribution)
- Unit: revision rules + 4-locale `projectPlans` key parity
- Portal route registry: **8/8 pass** (new pages listed in `PORTAL_ROUTES`)

## 6. REQUESTS TO MAIN AGENT

1. **Navigation** — Project tab / Execution link to `/projects/[projectId]/plans`; portal nav `implemented: true` for `project.documents`, `project.plans`, `project.plan` in `src/modules/contractor-portal/domain/routes.ts` (Track R/S).
2. **Settings activity labels** — Add labels for `DOCUMENTS_AUDIT_ACTIONS` under `settings.activity.actions` (4 locales) if settings UI should show them.
3. **Promote migration** — Copy `0162_dg_documents_plans.sql` into `drizzle/migrations/` when Owner approves SQL execution.

## 7. Known gaps

None for Track IJ scope (logic, RLS tests, frozen APIs, routes, i18n, UI). Production migration apply and cross-track nav wiring remain MAIN AGENT / Owner actions.
