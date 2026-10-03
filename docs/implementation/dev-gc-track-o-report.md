# Track O — Daily site log / meetings / site instructions (FINAL report §0.6)

**Slot:** `0165_dg_daily_log_meetings_instructions.sql` · **Registry:** `field` · **Date:** 2026-10-03

WIP SQL **not** applied to any shared database.

---

## 1. Files created / changed

### Modules (owned)

| Area | Path |
|------|------|
| Daily log | `src/modules/site-log/**` (domain, data, application, validation, UI helpers) |
| Contractor meetings | `src/modules/site-meetings/**` (extends legacy `meetings` tables) |
| Site instructions | `src/modules/site-instructions/**` |
| Schema mirror | `drizzle/schema/dg-field.ts` (exported from `drizzle/schema/index.ts`) |
| Migration (prepared) | `drizzle/migrations-wip/0165_dg_daily_log_meetings_instructions.sql` |

### Shared slots (Track O owns per brief §0.2)

- `src/shared/domain-events/events/field.ts` → merged in `domain-events/registry.ts`
- `src/shared/entity-access/resolvers/field.ts` → merged in `entity-access/index.ts`
- `src/shared/audit/dg/field.ts` → merged in `shared/audit/actions.ts`
- External caps: `ext.daily_log.submit`, `ext.site_instruction.ack` in `shared/external/capabilities.ts`
- i18n: `src/locales/{he-IL,en,ar,ru}/siteOps.json` + `siteOps` in `shared/i18n/config.ts`

### Routes

| App | Route |
|-----|-------|
| Internal | `projects/[projectId]/site-log/page.tsx` |
| Internal | `projects/[projectId]/site-log/[logDate]/page.tsx` + `actions.ts` |
| Internal | `projects/[projectId]/site-meetings/page.tsx`, `[meetingId]/page.tsx` + `actions.ts` |
| Internal | `projects/[projectId]/instructions/page.tsx`, `[instructionId]/page.tsx` + `actions.ts` |
| Portal | `contractor/(portal)/projects/[projectId]/site-log/page.tsx` + `actions.ts` |
| Portal | `contractor/(portal)/projects/[projectId]/instructions/page.tsx`, `[instructionId]/page.tsx` + `actions.ts` |

Portal contractor meeting minutes are embedded on the portal site-log page (no separate portal meetings route per brief §2).

### Tests / fixtures

- `tests/integration/dg-field/field.test.ts` — PGlite + RLS (10 cases, contractor A vs B isolation)
- `tests/unit/dg-field/domain.test.ts` — pure domain (log summary, instruction lifecycle, meeting rules, zoned time)
- `tests/setup/dg-fixtures-field.ts` — Track O scenario (`runAsContractor`, `seedFieldScenario`, stand-in linked task)

### Finish pass (this session)

- Portal `site-log` and `instructions/[instructionId]` — `WithClientMessages` for `siteOps` / `projectPlans` / `collaboration` (evidence uploader + contractor discussion).
- §0.6 report (this file).

---

## 2. Tables / functions / RLS (WIP `0165_dg_daily_log_meetings_instructions.sql`)

**New tables**

- `site_daily_logs`, `site_daily_log_entries` — one internal log per project/date; closed logs locked until reopen
- `site_daily_reports` — append-only contractor daily report revisions (vendor scoped)
- `site_meeting_details`, `site_meeting_contractors`, `site_meeting_action_assignments`
- `site_meeting_publications`, `site_meeting_publication_actions` — immutable published minutes + per-vendor action snapshots
- `site_instructions`, `site_instruction_events` — status changes only via append-only events (trigger-driven)

**Reused tables (additive DG RLS)**

- `meeting_records`, `meeting_attendees`, `meeting_decisions`, `meeting_action_items`

**Functions / triggers**

- `app.site_daily_logs_closed_lock`, `app.site_daily_log_entries_open_guard`
- `app.site_daily_reports_assign_revision`, `app.site_field_append_only`
- `app.site_meeting_details_match_meeting`, capability / attendee helpers
- `app.site_instruction_apply_event` (+ insert/update guards on instructions)

**RLS**

- Internal: project capabilities (`field_ops.read` / `field_ops.manage`, `meetings.manage`, `contractor.coordinate`, etc. as defined in SQL)
- External: vendor-scoped daily reports and instructions; meeting publications visible only to invited contractor attendees

**Not applied** — prepared for Owner review only.

---

## 3. Use-cases, actions, routes, components

| Domain | Entry points |
|--------|----------------|
| Daily log | `getDailyLogCalendar`, `getDailyLogDay`, `updateDailyLogHeader`, `addDailyLogEntry`, `closeDailyLog`, `reopenDailyLog` |
| Contractor reports | `getContractorDailyReports`, `submitContractorDailyReport` (`ext.daily_log.submit`) |
| Meetings | `createSiteMeeting`, attendees, decisions, `addMeetingActionItem` (+ optional `createLinkedTask`), `publishMeetingMinutes` |
| Portal minutes | `listContractorMeetingMinutes` (attendee-scoped) |
| Instructions | `issueInstruction`, `transitionInstruction`, conversion request/link (`entity_links` → subcontract change or unpriced work) |
| Contractor instructions | `listContractorInstructions`, `acknowledgeInstructionAsContractor`, `reportInstructionPerformedAsContractor` |

UI: shared `FieldActionForm`, `SiteLogDateJump`, meeting/instruction status tones, evidence attach on log day / instruction / report.

Domain events (subset): `field.daily_log.submitted`, `field.instruction.issued|acknowledged`, `field.meeting.published`, conversion events without financial payload on contractor-visible streams.

---

## 4. Events, resolvers, audit

- `FIELD_DOMAIN_EVENTS` registered in `src/shared/domain-events/registry.ts`
- `FIELD_ENTITY_RESOLVERS` for `daily_log`, `site_meeting`, `site_instruction`
- `FIELD_AUDIT_ACTIONS` merged into `AUDIT_ACTIONS`
- Deep links for O events pre-wired in `src/modules/dg-events/domain/event-catalog.ts` (Track T consumer; no Track O edits required)

---

## 5. Tests + results

```powershell
$env:PF_WIP_FILES='0165_dg_daily_log_meetings_instructions.sql'
npx vitest run tests/integration/dg-field/field.test.ts
npx vitest run tests/unit/dg-field
```

| Suite | Result |
|-------|--------|
| Integration `field.test.ts` | **10/10 pass** (daily log lock, auth, contractor A/B reports & instructions, financial conversion + entity link, meetings + linked tasks + minutes isolation) |
| Unit `dg-field/domain.test.ts` | **pass** (pure domain mirrors) |

Targeted typecheck: no errors reported in Track O-owned paths when filtering `tsc` output for `site-log`, `site-meetings`, `site-instructions`, `dg-field`, `siteOps`.

---

## 6. REQUESTS TO MAIN AGENT

1. **Project navigation (Track S)** — Add Execution group links to `/site-log`, `/site-meetings`, `/instructions` when project has developer/GC profile.
2. **Contractor portal shell (Track R)** — Surface portal links to `/site-log` and `/instructions` (and pending ack counts via `getContractorInstructionSummary` if desired on dashboard).
3. **Search / FAB (Track U)** — Global search + FAB entries for meeting and site instruction with project prefill.
4. **Settings activity labels** — Optional human labels for `FIELD_AUDIT_ACTIONS` in settings activity UI (4 locales).
5. **Migration promote** — After Final Gate, copy WIP `0165` into reserved slot; **Owner explicit approval** before `db:migrate` on shared DB.

---

## 7. Known gaps

None for Track O scope (schema prepared, RLS integration tests, frozen module APIs, internal + portal routes, `siteOps` 4-locale parity, contractor A/B isolation). Cross-track nav, notification consumer wiring in production, and SQL apply remain MAIN AGENT / Owner actions.
