# Track T — Notifications / domain-event consumer / Command Center (FINAL report §0.6)

Per `docs/implementation/dev-gc-track-briefs.md` §0.6. WIP SQL **not** applied to any shared database.

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/migrations-wip/0169_dg_notifications_command_center.sql
PURPOSE = external_notifications + domain_event_retries for idempotent DG consumer
DATA MUTATION = none (new tables only)
SCHEMA MUTATION = additive (2 tables, RLS, grants)
RISK = low (isolated from public.notifications; service-role writes only)
READY FOR OWNER REVIEW = YES
```

## 1. Files created/changed

**New (Track T owned)**

- `src/modules/dg-events/**` — idempotent consumer, spec registry, backoff, recipient resolution, notification writer repos
- `src/app/api/internal/dg-events-worker/route.ts` — frequent cron/operator entry (service role)
- `drizzle/schema/dg-notifications.ts`, `drizzle/migrations-wip/0169_dg_notifications_command_center.sql`
- `src/modules/notifications/application/external-notifications.ts`, `data/external-notifications.repository.ts`
- `src/modules/notifications/domain/dg-copy.ts`, `domain/external-visibility.ts`
- `src/modules/command-center/data/collect-dg.ts`, `data/dg-ports.ts`, `domain/dg-items.ts`
- `tests/integration/dg-events/consumer.test.ts`
- `tests/unit/dg-events/event-catalog.test.ts`, `recipients-scope-backoff.test.ts`
- `tests/unit/notifications/dg-copy-and-external-visibility.test.ts`
- `tests/unit/command-center/dg-items.test.ts` (DG item builder / capability scoping)

**Additive edits (Track T slots in shared areas)**

- `src/shared/domain-events/events/notifications.ts` — registry slot (consumer maps all brief events; no new emit types here)
- `src/shared/entity-access/resolvers/notifications.ts` — empty (no thread/evidence entities in T)
- `src/shared/audit/dg/notifications.ts` — empty (consumer is system-side; no user audit verbs)
- `src/modules/command-center/data/collect-sources.ts` — wires `collectDgSources`
- `src/modules/command-center/domain/types.ts`, `domain/ranking.ts`, `index.ts`
- `src/modules/notifications/index.ts`, `domain/types.ts`, `domain/copy.ts`, `application/localize-notifications.ts`
- `src/locales/{he-IL,en,ar,ru}/notifications.json` — `dg.copy` for every brief event + DG notification types
- `src/locales/{he-IL,en,ar,ru}/commandCenter.json` — nine `dg_*` Command Center source labels/copy
- `src/app/api/internal/ops-worker/route.ts` — daily safety-net `runDgEventsOpsWorker()`

**Not edited (per track rules)**

- `drizzle/migrations/*`, `meta/_journal.json`
- Other tracks’ modules (except existing F `register-ports.ts` consumed by Command Center)

## 2. WIP SQL (`0169_dg_notifications_command_center.sql`) — summary

| Object | Role |
|--------|------|
| `external_notifications` | Contractor-principal in-app feed; dedupe per `(org, principal, dedupe_key)`; portal deep links only; RLS `principal_id = app.external_principal_id()`; authenticated SELECT + UPDATE `(read_at, dismissed_at)` only |
| `domain_event_retries` | Backoff schedule keyed by `domain_events.id`; service_role only |

Depends on 0155 (`domain_events`, external principal helpers). Does not alter `public.notifications`.

## 3. Use-cases, actions, routes, components

| Surface | Entry | Notes |
|---------|--------|--------|
| Service worker | `POST/GET /api/internal/dg-events-worker` | `runDgEventsOpsWorker`, 45s budget, `CRON_SECRET` / internal worker auth |
| Daily ops | `/api/internal/ops-worker` | Best-effort `runDgEventsOpsWorker()` alongside other scans |
| Internal inbox | Existing `listNotifications` / bell UI | DG rows use `type` in `DG_NOTIFICATION_EVENT_TYPES`, localized via `localizeNotificationInbox` + `dg` metadata |
| Contractor portal | `listExternalNotifications`, `unreadExternalCount`, `markExternalNotificationRead`, `markAllExternalNotificationsRead` | Track R wires UI; reads re-check grant capabilities |
| Command Center | `collectDgSources` → `buildDgItems` | Capability-scoped project lists; savepoint-isolated port queries; nine DG source types |

No new internal/portal pages in T (brief: additive engine + collectors).

## 4. Events, resolvers, audit

- **Consumer catalog:** `src/modules/dg-events/domain/event-catalog.ts` — handler for every event named in brief §3 (52 brief types + alias `defect.item.completion_submitted`); financial internal audiences use financial caps only; external principals filtered by grant + `required_capabilities` on read.
- **Registry:** `createDgEventHandlerRegistry()` / `defaultDgEventHandlers`; unknown types marked processed with no side effects.
- **Deep links:** frozen internal `/projects/...` and portal `/contractor/...` paths in `domain/deep-links.ts`.
- **Command Center ports:** registry in `command-center/data/dg-ports.ts`; **registered today:** Track F `dg_claim_awaiting_review`, `dg_payment_eligibility_blocked` via `subcontract-claims/register-ports.ts` (imported from module index). Other seven sources await owner-track `registerDgCommandCenterPort` calls (see §6).

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0169_dg_notifications_command_center.sql'
npx vitest run tests/integration/dg-events tests/unit/dg-events tests/unit/notifications/dg-copy-and-external-visibility.test.ts tests/unit/command-center/dg-items.test.ts tests/unit/command-center/shell-cpu-collect.test.ts
```

| Suite | Result |
|-------|--------|
| `tests/integration/dg-events/consumer.test.ts` | **9/9 pass** — claim financial routing, contractor isolation, idempotency/dedupe, backoff/dead-letter rollback, external RLS read/mark, grant capability hide |
| `tests/unit/dg-events/event-catalog.test.ts` | **7/7 pass** — brief coverage, financial cap rules, 4-locale copy |
| `tests/unit/dg-events/recipients-scope-backoff.test.ts` | **12/12 pass** |
| `tests/unit/notifications/dg-copy-and-external-visibility.test.ts` | **6/6 pass** |
| `tests/unit/command-center/dg-items.test.ts` | **6/6 pass** |
| `tests/unit/command-center/shell-cpu-collect.test.ts` | **4/4 pass** |

`npx tsc --noEmit`: no errors reported under `dg-events`, `notifications` (DG additions), or `command-center` DG paths.

## 6. REQUESTS TO MAIN AGENT

1. **Vercel cron** — add schedule hitting `/api/internal/dg-events-worker` (e.g. every 1–5 minutes); daily ops-worker alone is a safety net only.
2. **Command Center ports** — owner tracks register queries (see comments in `dg-ports.ts`): H coordination blocked, G critical task overdue, MN defect verification, KL RFI/submittal, P compliance expiring, O/IJ/H acknowledgement overdue.
3. **Contractor portal UI (Track R)** — notification center page/badge using `listExternalNotifications` / `unreadExternalCount`.
4. **Journal promotion** — when Final Gate approves, copy verified `drizzle/migrations-wip/0169_dg_notifications_command_center.sql` into reserved `drizzle/migrations/0169_*` if WIP differs from promoted snapshot.
5. **Import side-effect** — ensure app bootstrap imports `@/modules/subcontract-claims` (or equivalent) so F Command Center ports register in production.

## 7. Known gaps

*(empty — Track T engine, consumer, external reads, collectors framework, and 0169 WIP tests complete; remaining items are cross-track wiring listed in §6.)*
