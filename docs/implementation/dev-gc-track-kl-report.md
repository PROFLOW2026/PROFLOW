# Track KL final report (RFI + submittals)

Registry key: `rfi` · Migration WIP: `drizzle/migrations-wip/0163_dg_rfi_submittals.sql`

## 1. Files created/changed

**Modules (Track KL owns)**

- `src/modules/rfi/**` — domain, data, application, validation, actions, UI, `index.ts`
- `src/modules/submittals/**` — domain, data, application, validation, actions, UI, `index.ts`
- `drizzle/schema/dg-rfi-submittals.ts` — mirrors WIP SQL (pre-existing)
- `src/locales/{he-IL,en,ar,ru}/rfi.json`, `submittals.json` — full namespaces (pre-existing)
- `tests/integration/rfi-submittals/**` — PGlite + RLS (pre-existing)
- `tests/setup/dg-fixtures-rfi.ts` — Track KL fixtures (pre-existing)
- `tests/unit/rfi/lifecycle.test.ts`, `tests/unit/submittals/lifecycle.test.ts` — pure domain rules

**Routes (Track KL)**

- Internal: `src/app/[locale]/(app)/projects/[projectId]/rfi/page.tsx`, `.../rfi/[rfiId]/page.tsx`, `.../submittals/page.tsx`, `.../submittals/[submittalId]/page.tsx`
- Portal: `src/app/[locale]/contractor/(portal)/projects/[projectId]/rfi/page.tsx`, `.../rfi/[rfiId]/page.tsx`, `.../submittals/page.tsx`, `.../submittals/[submittalId]/page.tsx`

**Shared slots (Track KL owns per brief §0.2)**

- `src/shared/domain-events/events/rfi.ts`
- `src/shared/entity-access/resolvers/rfi.ts`
- `src/shared/audit/dg/rfi.ts`

## 2. WIP SQL (`0163_dg_rfi_submittals.sql`)

- `rfis`, `rfi_status_events`, `rfi_answers` — append-only official answers (immutable trigger)
- `submittals`, `submittal_revisions`, `submittal_reviews` — immutable revisions + append-only reviews
- RLS: internal `project.view` / `rfi.manage` / `submittal.manage`; external vendor-scoped via `ext.rfi.raise` / `ext.submittal.submit`
- Status guard triggers aligned with TypeScript lifecycle helpers

**Not applied** — prepared for Owner review only.

## 3. Use-cases, actions, routes, components

| Area | Entry |
|---|---|
| Internal RFI | `createRfi`, `updateRfi`, transitions, `answerRfi` (append-only), `listProjectRfis`, `getRfi` |
| Contractor RFI | `createContractorRfi`, `updateContractorRfi`, `submitContractorRfi`, `listContractorRfis`, `getContractorRfi` |
| Internal submittals | `createSubmittal`, `reviewSubmittal`, `openSubmittalRevision`, revision notes, `listProjectSubmittals`, `getSubmittal` |
| Contractor submittals | `createContractorSubmittal`, revision workflow, `listContractorSubmittals`, `getContractorSubmittal` |
| Portal summaries (Track R) | `getContractorRfiSummary`, `getContractorSubmittalSummary` |
| Command Center reads (Track T) | `listOverdueRfis`, `listPendingSubmittals`, `countOverdueRfis`, `countOverdueSubmittals` |
| Server actions | `src/modules/rfi/actions/*`, `src/modules/submittals/actions/*` |
| UI | List/create/detail panels; mobile card lists; evidence/discussion hooks (stubs until Track I/G land) |

Domain events: `rfi.request.submitted|answered|closed|reopened`, `submittal.package.submitted|reviewed`.

## 4. Events, resolvers, audit

- Registered in `src/shared/domain-events/registry.ts` via `RFI_DOMAIN_EVENTS`
- Entity scope resolvers in `RFI_ENTITY_RESOLVERS` (`rfi`, `submittal`, `submittal_revision`)
- Audit actions in `AUDIT_ACTIONS` via `RFI_AUDIT_ACTIONS`

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0163_dg_rfi_submittals.sql'
npx vitest run tests/integration/rfi-submittals
npx vitest run tests/unit/rfi tests/unit/submittals
```

- Integration: **12/12 pass** (RFI lifecycle + append-only answers + audited reopen; contractor A/B isolation; submittal immutable revisions; authorization; overdue/summary queries; schema smoke)
- Unit: lifecycle invariants for RFI and submittals

## 6. REQUESTS TO MAIN AGENT

1. **Navigation** — Add Execution/project tabs and contractor portal links to `/projects/[projectId]/rfi`, `/submittals`, and portal `/contractor/projects/[projectId]/rfi`, `/submittals` (Track S/R/U).
2. **FAB** — Optional “RFI” and “Submittal” create entries with project prefill (Track U).
3. **Settings activity labels** — Add human labels for `RFI_AUDIT_ACTIONS` in `settings.activity.actions` (4 locales) if settings UI should show them.
4. **Evidence UI** — Detail pages call `<EvidenceGallery>` / `<EvidenceUploader>` (Track I stubs today).

## 7. Known gaps

*(empty — Track KL scope complete per brief §3/KL)*
