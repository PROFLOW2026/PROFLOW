# Track G final report (collaboration / contractor tasks)

Registry key: `collab` · Migration WIP: `drizzle/migrations-wip/0160_dg_collaboration_tasks.sql`

## 1. Files created/changed

**Module (Track G owns)**

- `src/modules/collaboration/**` — domain, data, application (use-cases), frozen `index.ts` APIs, UI (`ui.tsx`, `ui/*`, `shared/*`)
- `drizzle/schema/dg-collaboration.ts` — mirrors WIP SQL
- `src/locales/{he-IL,en,ar,ru}/collaboration.json` — full namespace (was empty)
- `tests/integration/collaboration/contractor-tasks.test.ts` — PGlite + RLS (7 cases)
- `tests/unit/collaboration/{task-lifecycle,activity}.test.ts`
- `tests/setup/dg-fixtures-collab.ts` — Track G fixtures (pre-existing)

**Routes (Track G)**

- Internal: `src/app/[locale]/(app)/projects/[projectId]/activity/page.tsx`
- Portal: `src/app/[locale]/contractor/(portal)/projects/[projectId]/tasks/page.tsx`, `.../tasks/[taskId]/page.tsx`

**Additive integration**

- `src/app/[locale]/(app)/tasks/[taskId]/page.tsx` — `<TaskContractorSection>` when task has `projectId`

**Shared slots (Track G owns per brief §0.2)**

- `src/shared/domain-events/events/collab.ts`
- `src/shared/entity-access/resolvers/collab.ts`
- `src/shared/audit/dg/collab.ts`

## 2. WIP SQL (`0160_dg_collaboration_tasks.sql`)

- `tasks (id, organization_id)` unique index for composite FKs
- `task_external_assignments` — 1:1 contractor extension on existing `tasks`; lifecycle + operational links; integrity trigger
- `task_external_events` — append-only history (immutable trigger)
- `collab_comments` — append-only entity threads (`internal` | `contractor` audience)
- RLS: internal `tasks.view` / `tasks.manage`; external read/update only vendor-scoped assignments; comments filtered by audience + grant
- Trigger syncs `tasks.status` / completion from external lifecycle

**Not applied** — prepared for Owner review only.

## 3. Use-cases, actions, routes, components

| Capability | Entry |
|---|---|
| Linked / contractor tasks | `createLinkedTask`, `assignTaskToContractor`, `linkTaskToEntity`, lifecycle commands |
| Discussions | `postInternalComment`, `postExternalComment`, `loadInternalDiscussion`, `loadExternalDiscussion` |
| Activity | `loadProjectActivity`, `loadContractorActivity` |
| Portal reads | `listContractorPortalTasks`, `getContractorPortalTask`, `getContractorTaskSummary` |
| Internal task UI | `getTaskContractorPanel`, `<TaskContractorSection>` |
| Frozen UI | `<EntityDiscussion>`, `<ActivityFeed>` (server components + composer actions in `ui/actions.ts`) |

Domain events: `task.external.*`, `task.linked.created`, `collab.comment.posted`, `collab.decision.recorded`.

## 4. Events, resolvers, audit

- Registered in `src/shared/domain-events/registry.ts` via `COLLAB_DOMAIN_EVENTS`
- Entity scope resolvers in `COLLAB_ENTITY_RESOLVERS` (task + linkable entity types for threads)
- Audit actions in `AUDIT_ACTIONS` via `COLLAB_AUDIT_ACTIONS`

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0160_dg_collaboration_tasks.sql'
npx vitest run tests/integration/collaboration/contractor-tasks.test.ts
npx vitest run tests/unit/collaboration
```

- Integration: **7/7 pass** (lifecycle, A/B isolation, RLS tamper, discussion audience, activity redaction/pagination, linked-task auth)
- Unit: task-lifecycle + activity redaction/message keys

Targeted typecheck: fix only Track G files if `tsc` reports errors in this module.

## 6. REQUESTS TO MAIN AGENT

1. **Navigation** — Add project tab / Execution group link to `/projects/[projectId]/activity` and portal link to `/contractor/projects/[projectId]/tasks` (Track S/R/U).
2. **FAB** — Optional “contractor task” create entry calling `createLinkedTask` with contractor assignee (Track U).
3. **Settings activity labels** — Add human labels for `collab.ts` / `task_external.*` audit actions in `settings.activity.actions` (4 locales) if settings UI should show them.
4. **Evidence module** — Track I `countEvidence` / upload UI is mocked in integration tests; portal task detail uses `<EvidenceUploader>` / `<EvidenceGallery>` (stubs until Track I lands).

## 7. Known gaps

None for Track G scope (logic, RLS tests, frozen APIs, routes, i18n namespace, UI implementations). Cross-track nav and production migration apply remain MAIN AGENT / Owner actions.
