# Track H final report (coordination events / readiness / schedule)

Registry key: `coordination` · Migration WIP: `drizzle/migrations-wip/0161_dg_coordination_events.sql`

**MIGRATION APPLIED = NO** — prepared for Owner review only; verified on local PGlite with `PF_WIP_FILES=0161_dg_coordination_events.sql`.

## 1. Files created/changed

**Module (Track H owns)**

- `src/modules/coordination/**` — domain (`readiness`, `lifecycle`, `assemble`, `time`, `constants`), data (`coordination.repository.ts`), application (`queries`, `manage-events`, `responses`, `external`, `authorization`, `shared`), validation, server actions (`internal-actions`, `external-actions`), UI (list, create form, readiness matrix, manage panel, contractor respond form, calendar source, history, issues, linked documents), `index.ts` exports
- `drizzle/schema/dg-coordination.ts` — mirrors WIP SQL (exported from `drizzle/schema/index.ts`)
- `src/locales/{he-IL,en,ar,ru}/coordination.json` — full namespace (key parity verified across 4 locales)
- `tests/integration/coordination/coordination.test.ts` — PGlite + RLS (4 cases)
- `tests/unit/coordination/{readiness,lifecycle,constants}.test.ts`
- `tests/setup/dg-fixtures-coordination.ts` — `asContractor()` helper for external RLS sessions

**Routes (Track H)**

- Internal: `src/app/[locale]/(app)/projects/[projectId]/coordination/page.tsx`, `.../coordination/[eventId]/page.tsx`
- Portal: `src/app/[locale]/contractor/(portal)/projects/[projectId]/schedule/page.tsx`, `.../events/[eventId]/page.tsx`

**Calendar / timeline integration (minimal additive import)**

- `src/app/[locale]/(app)/projects/[projectId]/calendar/page.tsx` — `<CoordinationCalendarSource />`
- `src/app/[locale]/(app)/projects/[projectId]/timeline/page.tsx` — `<CoordinationCalendarSource />`

**Shared slots (Track H owns per brief §0.2)**

- `src/shared/domain-events/events/coordination.ts` (+ registry import)
- `src/shared/entity-access/resolvers/coordination.ts` (+ index registration)
- `src/shared/audit/dg/coordination.ts` (+ `AUDIT_ACTIONS` import)

## 2. WIP SQL (`0161_dg_coordination_events.sql`)

**Tables**

1. `coordination_events` — multi-party site event (kind, schedule, location/WP/phase links, required acknowledgements JSON, `readiness_epoch_at`)
2. `coordination_event_participants` — contractor + internal invitations (required/optional, soft-remove)
3. `coordination_responses` — **append-only** contractor readiness answers (READY / NOT_READY / READY_WITH_CONDITIONS / ACKNOWLEDGED / BLOCKED), actor shape, acknowledgement keys
4. `coordination_issues` — issues from responses (immutable facts; status transitions via controlled updates)
5. `coordination_reschedules` — append-only reschedule history
6. `coordination_readiness_overrides` — append-only authorized overrides (force_ready / cleared + reason)
7. `coordination_outcomes` — append-only outcome records
8. `coordination_event_documents` — document metadata links (no file copies)

**Functions / triggers**

- `app.coordination_can_read` / `can_manage` / `external_invited` / `readiness_facts` / `project_contractors` / `event_time_zone`
- Append-only triggers on responses, reschedules, overrides, outcomes; participant identity immutability; response fill trigger (vendor/agreement snapshot, epoch supersede)

**RLS**

- Internal: `schedule.view` / `contractor.coordinate` read; `schedule.manage` / `contractor.coordinate` write via `app.has_project_capability`
- External: event visible only when vendor (and agreement if narrowed) is an invited party; responses/issues scoped to own party; insert requires `ext.event.respond`
- `service_role` all-policies; no money columns anywhere

**Not applied** — prepared for Owner review only.

## 3. Use-cases, actions, routes, components

| Capability | Entry |
|---|---|
| Internal CRUD / manage | `createCoordinationEvent`, `updateCoordinationEventDetails`, `inviteCoordinationParticipants`, `updateCoordinationParticipant`, `rescheduleCoordinationEvent`, `recordCoordinationOutcome`, `overrideCoordinationReadiness`, `linkCoordinationDocument`, `unlinkCoordinationDocument`, `dismissCoordinationIssue`, `requestCoordinationReadiness`, `recordResponseOnBehalf`, `createCoordinationFollowUpTask` |
| Internal reads | `listProjectCoordinationEvents`, `getCoordinationEventDetail`, `listCoordinationCalendarItems`, `loadCoordinationFormOptions` |
| Portal reads / respond | `listContractorSchedule`, `getContractorEventDetail`, `getContractorCoordinationSummary`, `respondToCoordinationEvent` |
| Pure readiness | `computeEventReadiness`, `isReadyState` |
| UI | `<ReadinessMatrix>` (desktop table / mobile cards, remind-all, answer-on-behalf, follow-up task), `<ContractorRespondForm>` (mobile portal respond + raise issue), `<CoordinationManagePanel>`, `<CoordinationCalendarSource>` |
| Server actions | `internal-actions.ts`, `external-actions.ts` (`respondToCoordinationEventAction`) |

Domain events: `coordination.event.*`, `coordination.readiness.*`, `coordination.contractor.*`, `coordination.issue.*`.

## 4. Events, resolvers, audit

- Registered in `src/shared/domain-events/registry.ts` via `COORDINATION_DOMAIN_EVENTS`
- Entity scope: `coordination_event`, `coordination_participant`, `coordination_response` in `COORDINATION_ENTITY_RESOLVERS`
- Audit actions in `AUDIT_ACTIONS` via `COORDINATION_AUDIT_ACTIONS`

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0161_dg_coordination_events.sql'
npx vitest run tests/integration/coordination tests/unit/coordination
```

- Integration: **4/4 pass**
  - Full **"יציקת תקרה קומה 1"** use-case flow (NOT READY → linked task → reconfirm READY → event READY → completed; domain-event ordering; append-only UPDATE rejected)
  - **Contractor A/B isolation** (schedule visibility, RLS row counts, cross-party respond forbidden, uninvited contractor empty, read-only grant cannot respond)
  - Internal capabilities + readiness override audit
  - Reschedule + reconfirmation + portal pending-ack summary + calendar items
- Unit: **19/19 pass** (readiness matrix rules, lifecycle, constants)
- **Total: 23/23 pass** (2026-10-03 run)

Targeted `tsc --noEmit`: no errors reported under `coordination` paths (other tracks may still have mid-flight errors).

## 6. REQUESTS TO MAIN AGENT

1. **Navigation** — Add project tab / Execution group link to `/projects/[projectId]/coordination` and portal bottom nav link to `/contractor/projects/[projectId]/schedule` (Track S/R/U).
2. **FAB** — Optional “coordination event” create entry with project prefill (Track U).
3. **Settings activity labels** — Add human labels for `COORDINATION_AUDIT_ACTIONS` keys in `settings.activity.actions` (4 locales) if the settings activity UI should show coordination audit rows (same pattern as Track G note).
4. **Evidence module** — Portal/internal detail uses `<EvidenceUploader>` / `<EvidenceGallery>` on `coordination_response` / `coordination_event` (Track I stubs until evidence lands).
5. **Migration ledger** — Add `0161_dg_coordination_events.sql` row when promoting WIP → `drizzle/migrations/` after Final Gate.
6. **Notifications / Command Center** — Track T consumer for `coordination.event.ready`, blocked events, overdue acknowledgements (deep links to internal + portal routes).

## 7. Known gaps

None for Track H scope (schema WIP, module layering, RLS tests, frozen cross-track APIs, internal + portal routes, readiness matrix UI, append-only responses, 4-locale `coordination` namespace, calendar source integration). Cross-track nav, production migration apply, settings audit labels, and notification consumers remain MAIN AGENT / Owner actions.
