# Developer / GC - track briefs (MAIN AGENT owned)

Read with: `docs/implementation/dev-gc-shared-contracts.md` (frozen contracts) and
`.cursor/plans/developer_gc_subcontractor_management.plan.md` (master plan).

Baseline at takeover (2026-10-03, HEAD `e4ebe6b`): project-team unit + PGlite integration, dg-foundation
integration and migration-journal tests = 50/50 pass; `tsc --noEmit` passes.

---

## 0. Common rules for EVERY track (non-negotiable)

### 0.1 Safety
- **Never** run SQL against Production/shared Supabase. No `npm run db:migrate`, no `psql`, no Supabase MCP SQL.
  Only local PGlite through the vitest harness (`tests/setup/database.ts`).
- **Never** commit, push, stash, reset, revert, or `git checkout --` anything. Never delete files you do not own.
- Write only inside the repo.

### 0.2 Ownership / collisions
- Edit only the files your track owns (section per track) plus NEW files under your own module/route folders.
- Shared files you may append to **only in your own per-track slot** (already created, one file per track):
  - `drizzle/schema/dg-<track>.ts` (your tables; already exported from `drizzle/schema/index.ts`)
  - `drizzle/migrations-wip/<your slot>.sql` (your SQL; see 0.4)
  - `src/shared/domain-events/events/<track>.ts`
  - `src/shared/entity-access/resolvers/<track>.ts`
  - `src/shared/audit/dg/<track>.ts`
  - `src/locales/{he-IL,en,ar,ru}/<your namespaces>.json`
- Need a change in a file you do not own (permission catalog, `src/shared/external/*`, `src/shared/actor`,
  project layout/tabs, FAB, global nav, another track's schema, `drizzle/migrations/*`, journal)? **Do not edit it.**
  Put the exact request under "REQUESTS TO MAIN AGENT" in your final report. Exception: a track listed as owner.
- Reference other tracks' tables only through the frozen identities: `vendors`, `subcontract_agreements`,
  `subcontract_work_lines`, `project_locations`, `work_packages`, `tasks`, `documents`, `external_principals`,
  `external_access_grants`, `entity_links`, `domain_events`. Never FK to another new-track table; use `entity_links`
  or a plain uuid + entity type when you must refer to another track's entity.
- Frozen cross-track APIs (call them; owners implement them):
  - `assertProjectCapability / loadProjectCapabilities` - `@/modules/project-team`
  - `requireExternalContext()` - `@/modules/contractor-access` (Track C); then `requireExternalScope(ctx, target, cap)` from `@/shared/external`
  - `createLinkedTask`, `postInternalComment`, `postExternalComment` - `@/modules/collaboration` (Track G)
  - `<EntityDiscussion>`, `<ActivityFeed>` - `@/modules/collaboration/ui` (Track G)
  - `listEvidence`, `countEvidence` - `@/modules/evidence`; `<EvidenceGallery>`, `<EvidenceUploader>` - `@/modules/evidence/ui` (Track I)
  - `emitDomainEvent` - `@/shared/domain-events`; `resolveEntityScope` - `@/shared/entity-access`
  - `Actor` helpers - `@/shared/actor`
  Until the owner lands, these throw / render null. Code against them anyway; do not reimplement them.

### 0.3 Architecture per domain (a table is not a feature)
schema -> domain (pure rules + tests) -> authorization -> repository -> use-cases -> server actions -> UI
(internal + contractor portal where applicable) -> mobile -> i18n (4 locales) -> domain events -> audit -> tests.
No placeholders, no "coming soon", no dead routes, no empty locale namespace.

- Follow repo conventions: look at a mature module (e.g. `src/modules/safety`, `src/modules/meetings`,
  `src/modules/vendors`) for layering (`domain/`, `data/`, `application/`, `validation/`, `ui/`, `index.ts`),
  server-action style, `OrgContext` loading, zod validation, error types (`@/shared/errors`).
- This Next.js version has breaking changes: read `node_modules/next/dist/docs/` for anything routing/RSC/actions
  related before writing it.
- **Internal authorization**: every internal read/write calls `assertProjectCapability(ctx, projectId, cap)`
  (capabilities in `src/modules/project-team/domain/capabilities.ts`). Do not branch on role names.
- **External authorization**: every contractor read/write calls `requireExternalContext()` then
  `requireExternalScope(...)` with an `ext.*` capability (`src/shared/external/capabilities.ts`). Contractor data
  is always filtered by the grant's vendor/project/agreement. Contractor A must never see contractor B.
  External queries use `ctx.db` (RLS-bound). RLS for your tables must express the same rule via
  `app.has_project_capability(org, project, cap)` (internal) and `app.external_has_scope(org, project, vendor,
  agreement, cap)` / `app.external_can_see_project(org, project)` (external) - see 0154/0155.
- **Financial separation**: money columns live in separate tables or separate projections. Operational reads must
  not SELECT money. Never send money to the browser and hide it in React. Financial internal caps:
  `contract.financial.view`, `claim.*`, `payment.*`, `deductions.manage`, `retention.manage`, `financial.view`,
  `project_budget.*`, `change.financial.manage`, `contract.manage`. External financial caps: `ext.contract.view_value`,
  `ext.claim.*`, `ext.change.request`, `ext.payment.view`.
- **Actors**: tables recording who did something use `*_actor_type` + `*_user_id` + `*_principal_id` with the CHECK
  shape used by `entity_links` (0155). External writes never get an OrgContext.
- **Immutability**: decisions/submissions/assessments/acknowledgements that matter are append-only (trigger denying
  UPDATE/DELETE, pattern `app.domain_events_immutable` in 0155). Corrections = new row (revision / reversal / supersede).
- **Locations**: optional `location_id` with composite FK `(location_id, organization_id, project_id)` ->
  `project_locations(id, organization_id, project_id)` ON DELETE SET NULL (pattern in `subcontract_work_lines`).
- **Tenancy**: every table has `organization_id`; composite same-org FKs (`(x_id, organization_id)`); `FORCE ROW LEVEL
  SECURITY`; a `service_role` all-policy like 0155.
- **Domain events**: emit inside the same transaction as the state change, type `<domain>.<entity>.<verb>`, register in
  your events file. Payloads must not contain money unless the event is financial-only (`subcontract.claim.*`
  payloads: ids + statuses only - consumers re-read with their own authorization).
- **Performance**: scoped indexed queries, pagination, no N+1, no org-wide scans.
- **UI rules**: Hebrew first, RTL correct, responsive (tables collapse to cards on mobile), reuse existing UI kit in
  `src/shared/ui`, no local "+ New" buttons duplicating the global FAB (Track U wires FAB entries), no PDF download
  flows (print preview is OK), do not remove unrelated buttons.
- **Routes**: only the routes listed for your track (section 2). Do NOT edit `projects/[projectId]/layout.tsx`, the
  project tabs files, or global nav - Track S/U wire navigation from the route table.

### 0.4 Migrations
- Each schema-owning track has ONE reserved slot (section 1). Write SQL in `drizzle/migrations-wip/<slot>.sql` and
  mirror it in `drizzle/schema/dg-<track>.ts`. Idempotent style (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) like 0155.
- Additive and backward compatible with the deployed app (no renames/drops of existing columns; expand first).
- Run your PGlite tests with `PF_WIP_FILES=<slot>.sql` (comma separate if you need another track's WIP slot):
  PowerShell: `$env:PF_WIP_FILES='0159_dg_claims.sql'; npx vitest run tests/integration/dg-claims`.
- **Never** edit `drizzle/migrations/*.sql` or `meta/_journal.json`. The MAIN AGENT copies verified WIP files into the
  reserved slot and reviews them. Migration ordering: your SQL may depend on 0154/0155 and lower-numbered DG slots
  only (e.g. claims 0159 may reference 0158 objects, never 0160+).

### 0.5 Tests & validation (targeted only)
- Unit tests for pure domain rules: `tests/unit/<track>/`.
- PGlite integration tests (RLS + use-cases, incl. contractor A vs B isolation and financial projection): `tests/integration/<track>/`.
  Fixtures: `tests/setup/dg-fixtures.ts` (org members, projects, contractors, `externalContextFor`). You may add helpers in
  a NEW file `tests/setup/dg-fixtures-<track>.ts`; do not edit the shared one (request it).
- Typecheck: `npx tsc --noEmit` and only fix errors in files you own (others are mid-flight). Report others' errors.
- Do not run the full test suite, full build, or Playwright.

### 0.6 Final report (return to MAIN AGENT)
1. Files created/changed. 2. Tables/functions/RLS in your WIP SQL. 3. Use-cases, actions, routes, components. 4. Events,
resolvers, audit actions registered. 5. Tests + results. 6. REQUESTS TO MAIN AGENT (exact edits to files you do not own:
nav entries, capability additions, FAB entries, fixture helpers). 7. Known gaps (must be empty for completion).

---

## 1. Migration slots

| Slot | Track | Schema file |
|---|---|---|
| 0156_dg_external_identity | C | dg-external-identity.ts |
| 0157_dg_project_profile | D | dg-project-profile.ts |
| 0158_dg_subcontract_core | E | dg-subcontract.ts |
| 0159_dg_claims | F | dg-claims.ts |
| 0160_dg_collaboration_tasks | G | dg-collaboration.ts |
| 0161_dg_coordination_events | H | dg-coordination.ts |
| 0162_dg_documents_plans | IJ | dg-documents-plans.ts |
| 0163_dg_rfi_submittals | KL | dg-rfi-submittals.ts |
| 0164_dg_inspections_defects | MN | dg-quality.ts |
| 0165_dg_daily_log_meetings_instructions | O | dg-field.ts |
| 0166_dg_compliance_safety_materials | P | dg-compliance-safety.ts |
| 0167_dg_procurement_closeout | Q | dg-procurement-closeout.ts |
| 0168_dg_financial_projection_rls | B | (existing tables; no new schema file needed) |
| 0169_dg_notifications_command_center | T | dg-notifications.ts |
| 0170_dg_surfaces_cost_control | S | dg-surfaces.ts |

Registry file key per track: C=external, D=profile, E=subcontract, F=claims, G=collab, H=coordination, IJ=documents,
KL=rfi, MN=quality, O=field, P=compliance, Q=procurement, B=permissions, T=notifications, S=surfaces.

## 2. Route table (frozen)

Internal (Owner app + Employee users with project capabilities), base `src/app/[locale]/(app)/projects/[projectId]/`:

| Track | Routes |
|---|---|
| A | `team` |
| C | `contractor-access` |
| D | `structure` (profile, characteristics, locations tree, recommendations) |
| E | `contractors/[agreementId]/lines`, `contractors/[agreementId]/changes`, `unpriced-work` |
| F | `claims`, `claims/[claimId]`, `deductions` |
| G | `activity` (+ task integration inside the existing tasks UI) |
| H | `coordination`, `coordination/[eventId]` |
| IJ | `plans`, `plans/[drawingId]` (+ contractor sharing inside the existing documents tab components it owns) |
| KL | `rfi`, `rfi/[rfiId]`, `submittals`, `submittals/[submittalId]` |
| MN | `inspections`, `inspections/[inspectionId]`, `defects`, `defects/[defectId]` |
| O | `site-log`, `site-log/[logDate]`, `site-meetings`, `site-meetings/[meetingId]`, `instructions`, `instructions/[instructionId]` |
| P | `contractor-compliance`, `site-safety`, `deliveries` |
| Q | `tenders`, `tenders/[packageId]`, `contractor-closeout`, `contractor-warranty` |
| S | `execution` (project execution dashboard), `contractors` (list), `contractors/[agreementId]` (Contractor 360 shell + tabs), `cost-control` |

Contractor portal, base `src/app/[locale]/contractor/`:

| Track | Routes |
|---|---|
| C | `(auth)/sign-in`, `(auth)/activate`, `(auth)/forgot-password`, `(auth)/reset-password`, `(portal)/account` |
| R | `(portal)/layout.tsx`, `(portal)/page.tsx` (dashboard / today), `(portal)/projects/[projectId]/page.tsx`, `(portal)/notifications` |
| E | `(portal)/projects/[projectId]/contracts/[agreementId]` (lines; values only with ext.contract.view_value), `.../changes` |
| F | `(portal)/projects/[projectId]/claims`, `.../claims/[claimId]`, `.../payments` |
| G | `(portal)/projects/[projectId]/tasks`, `.../tasks/[taskId]` |
| H | `(portal)/projects/[projectId]/schedule`, `.../events/[eventId]` |
| IJ | `(portal)/projects/[projectId]/documents`, `.../plans`, `.../plans/[drawingId]` |
| KL | `(portal)/projects/[projectId]/rfi`, `.../rfi/[rfiId]`, `.../submittals`, `.../submittals/[submittalId]` |
| MN | `(portal)/projects/[projectId]/defects`, `.../defects/[defectId]`, `.../inspections` |
| O | `(portal)/projects/[projectId]/instructions`, `.../instructions/[instructionId]`, `.../site-log` |
| P | `(portal)/projects/[projectId]/compliance`, `.../deliveries`, `.../safety` |
| Q | `(portal)/projects/[projectId]/tenders`, `.../handover` |

Portal pages are mobile-first. Portal layout (Track R) loads the external context; domain pages still call
`requireExternalContext()` + `requireExternalScope` themselves.

## 3. Tracks

### A - Project team completion + UI + Owner/Employee integration
Own: `src/modules/project-team/**`, route `team`, namespace `projectTeam`, `tests/*/project-team/**`.
Deliver: team page (members list, add internal member from org members, template picker, per-capability toggles grouped
operational/financial/administrative with clear financial warning, deactivate/reactivate, audit), server actions,
anti-escalation surfaced in UI, "my projects" for employees (find how the Employee App `src/app/[locale]/employee` lists
projects; add a section listing projects where the user is an active project member with entry links), helper
`listMyProjectMemberships(ctx)`. Export a reusable `requireProjectCapabilityPage(projectId, cap)` for RSC pages
(redirect/notFound semantics consistent with repo). No migration (0154 exists; request MAIN AGENT if a change is needed).

### B - Financial projection security / existing leak closure / RLS (slot 0168, registry `permissions`)
Own: `src/modules/vendors/application/subcontracts.ts`, `src/modules/vendors/data/subcontracts.repository.ts`, any
existing subcontract/vendor read path that leaks money, BOQ subcontractor RLS, exports/reports that include subcontract
money. Known leak: `getSubcontractById`, `listVendorSubcontracts`, `listProjectSubcontracts`, `listOrgSubcontracts`
expose `originalAmount`, `retentionPercent`, value events under broad vendor read. Build an operational projection
(`SubcontractOperationalView`, no money) and a financial projection gated by the existing org financial permission
(find the right one in `src/shared/permissions/catalog.ts`; e.g. AP/financial read) OR project capability
`contract.financial.view`. Fix all callers (UI pages/exports/reports/search) so money is never loaded without permission.
Review `boq_subcontractor_*` RLS; prepare 0168 SQL for any RLS tightening (additive/safe). Add authorization tests
(operational user receives no money fields). Do not break existing Owner flows (Owner has all permissions).

### C - External identity / auth / grants / contractor sessions (slot 0156, registry `external`)
Own: `src/modules/contractor-access/**` (replace the stub, keep the frozen `requireExternalContext` signature),
`src/shared/external/**` implementation details only if strictly needed (capability catalog is frozen - request
additions), `drizzle/schema/dg-external-identity.ts`, `drizzle/schema/portal.ts` (contractor-related additions only),
`src/modules/portal/**` only where needed for contractor grants, routes per table (C), namespace `contractorAccess`,
middleware/proxy handling for `/contractor/**` (read how `src/middleware.ts`/`proxy.ts` and Supabase SSR are wired;
contractor routes must never require org membership and the org app must reject external principals).
Deliver: username + strong password accounts via the existing Supabase Auth infra (username -> synthetic internal
email mapping if Supabase needs email; document it), invite (token, expiry, single use) -> activate/password setup ->
sign-in -> reset -> revoke -> disable; multiple users per vendor; per-user grants with explicit org/project/vendor/
agreement scope and capability templates (`EXTERNAL_GRANT_TEMPLATES`) + custom capability selection; grant management UI
at `contractor-access` (requires `contractor.invite` / `external_access.manage`); `loadExternalContext` building an
RLS-bound executor (study how the existing org RLS executor sets JWT claims in `src/shared/db` and mirror it for the
principal's auth user); rate limiting on sign-in; audit with external actor; lifecycle tests; security tests: external
principal has no `organization_memberships`, cannot pass `requireOrgContext`, cannot read general org tables under RLS.
Account page for the contractor (change password, profile, language).

### D - Project delivery profile / characteristics / locations / recommendations (slot 0157, registry `profile`)
Own: `src/modules/project-profile/**` (new), `drizzle/schema/dg-project-profile.ts`, route `structure`, namespace
`projectProfile`, optional additions to the project create form ONLY as a new optional collapsible section component in
your module that Track S/U will mount (request the mount) - or, if trivial, add it to
`src/app/[locale]/(app)/projects/new/project-create-form.tsx` without changing existing behavior.
Deliver: optional project operating profile (standard / developer / general_contractor / project_management /
subcontractor, combinations), developer projects without a fake client (verify how `projects.client_id` nullability
works; if a schema change is needed, prepare it additively), construction characteristics (category, buildings, floors
above/below, units residential/commercial, public areas, parking levels, built/commercial/common/site area, construction
method, custom metadata jsonb), location tree CRUD (uses foundation `project_locations`; bulk generator e.g. "3 buildings
x 8 floors x 4 apartments"), `LocationPicker` client component exported for other tracks (`@/modules/project-profile/ui`),
rule-based recommendation engine (pure, tested): trades, work packages, milestones, coordination events, inspections,
handover requirements, task templates derived from characteristics; accept flow creates only non-financial records
(work packages/milestones/tasks via existing modules) - never contracts/commitments/payments.

### E - Subcontract core: agreements, work lines, work packages, changes, unpriced work (slot 0158, registry `subcontract`)
Own: `src/modules/subcontracts/**` (new; reuse `src/modules/vendors` domain helpers read-only - Track B owns the vendor
subcontract read paths), `drizzle/schema/dg-subcontract.ts`, routes per table (E), namespace `subcontracts`.
Deliver: agreement extensions (trade, work package, dates, payment terms, retention %/cap, advance rules, VAT treatment,
parent contract link, lifecycle draft->active->suspended->completed->closed, no destructive delete) - extend
`subcontract_agreements` additively or via a 1:1 extension table; work-line CRUD on foundation tables with line types
(quantity_rate, lump_sum, weighted_milestone, percentage, allowance, custom), weight %, planned dates, location, work
package; lines editable only before activation, after activation baseline changes only via approved changes; prices in
`subcontract_work_line_prices` (financial caps only); subcontract changes (addition, deduction, scope, quantity, rate,
extension, instruction, contractor proposal) with negotiation versions (append-only), approval updates current contract
value through the existing `subcontract_value_events` mechanism (pending never changes value); unpriced work records
(scope, contractor, issuer, date, evidence, status -> converted to change / rejected / cancelled); contractor portal views
(lines; values only with `ext.contract.view_value`; contractor change proposals with `ext.change.request`); exported
pure helpers `approvedContractValue(...)` and `revisedLineValue(...)` used by Track F. Events e.g.
`subcontract.change.submitted|approved|rejected`, `subcontract.agreement.activated`.

### F - Claims / certification / retention / advances / deductions / payment holds / AP (slot 0159, registry `claims`)
Own: `src/modules/subcontract-claims/**` (new), `drizzle/schema/dg-claims.ts`, routes per table (F), namespace
`subcontractClaims`. Reuse `retention_releases`/`src/modules/retention`, `subcontract_advances`, `ap_bills`,
`ap_payments`, `ap_payment_applications` (read existing modules; do not create parallel ledgers).
Deliver: claim header (project, vendor, agreement, period, number, status) + claim lines per work line + submission
revisions (immutable once submitted) + append-only assessment decisions (certify / reassess / reject line / return /
request evidence, with reason) so 80 submitted / 60 certified / 70 reassessed are all preserved; per-line values:
contract baseline, approved changes, revised value, prior certified cumulative, current submitted, cumulative submitted,
current certified, cumulative certified, remaining; ceiling validation vs revised value; claim-level retention (%,
cap, held, cumulative, released, remaining), advance recovery (reuse advances), deductions/back-charges as first-class
records (type, amount, reason, evidence, issuer, contractor-visible flag, dispute comment, append-only with reversal),
payment holds / eligibility (missing invoice, expired insurance (from Track P via a pure port you define), missing tax
doc, guarantee, handover doc) separate from certification; certified -> payable basis -> draft/expected AP bill only
(never auto-payment; VAT applied only at the AP invoice; all claim math NET); contractor portal: create/submit claim,
evidence per line, see returned/certified results, payments state (`ext.payment.view`). Internal review UI shows physical
progress, linked tasks/defects/inspections/evidence (via entity_links + evidence API). Events
`subcontract.claim.submitted|returned|certified|reassessed`, `subcontract.deduction.issued`. Tests for every invariant.

### G - Tasks for contractors / contextual collaboration / activity feed (slot 0160, registry `collab`)
Own: `src/modules/collaboration/**` (implement the frozen stubs), additive changes to `src/modules/tasks/**` needed for
external assignment (coordinate carefully; do not break existing task flows), `drizzle/schema/dg-collaboration.ts`,
routes per table (G), namespace `collaboration`.
Deliver: tasks assignable to internal user / contractor company / contractor user and linkable to project, vendor,
agreement, work line, work package, location, event, defect, RFI, inspection, document, claim line (entity_links);
external flow assigned -> acknowledged -> in_progress -> completion_submitted -> (verification) approved /
approved_with_remarks / rejected / rework_required -> reopened -> resubmitted -> closed, with required evidence gate
(`countEvidence`), optional quality assessment (satisfactory / needs_attention / unacceptable), full history; contextual
threads on any entity type registered in entity-access with audience internal|contractor (external never sees internal);
`<EntityDiscussion>`; project activity feed (human-readable timeline built from `domain_events`, paginated, filters:
contractor, type, user, location, period, work package; operational viewers never see financial event details) with
`<ActivityFeed>`; contractor portal task list + detail (mobile, acknowledge, start, submit completion with evidence).
Events `task.external.assigned|acknowledged|completion_submitted|verified|reopened`, `collab.comment.posted`.

### H - Coordination events / readiness / schedule (slot 0161, registry `coordination`)
Own: `src/modules/coordination/**` (new), `drizzle/schema/dg-coordination.ts`, routes per table (H), namespace `coordination`.
Deliver: coordination event (title, start/end, location, description, phase/work package link, required + optional
contractors (vendor/agreement), internal participants, preparation deadline, required acknowledgements, linked
documents/plans), invitations, contractor responses READY / NOT_READY / READY_WITH_CONDITIONS / ACKNOWLEDGED / BLOCKED
(append-only history; latest response per party) with note + evidence + raise issue/task (`createLinkedTask`);
readiness matrix; event readiness computed from required parties; authorized override (reason, actor, timestamp,
audit); outcome completed / partially_completed / postponed / cancelled with actual time + evidence; reschedule history;
integrate with the existing project calendar/timeline (read `src/app/[locale]/(app)/projects/[projectId]/calendar` and
`timeline`; add events as a source without breaking them - if a shared file must change, keep the change minimal and
report it); contractor agenda/schedule in portal + event respond page (mobile). Events
`coordination.event.created|rescheduled|completed|cancelled`, `coordination.readiness.requested`,
`coordination.contractor.ready|not_ready`, `coordination.event.ready`. E2E-style integration test of the
"יציקת תקרה קומה 1" flow at use-case level.

### IJ - Documents / external storage / uploads / media + Plans / revisions (slot 0162, registry `documents`)
Own: `src/modules/evidence/**` (implement frozen stubs), `src/modules/project-plans/**` (new),
`drizzle/schema/dg-documents-plans.ts`, routes per table (IJ), namespaces `projectPlans` (+ evidence strings inside it).
Deliver: evidence upload (internal + external server actions) into the configured external storage via existing
`documents` / `document_links` / external-storage services (study `src/modules/documents` and
`src/modules/external-storage`); MIME allow-list, size limits, safe filenames, scope checks through entity-access,
audit, no cross-contractor path access, metadata (uploader actor, time, project, vendor, location, linked entity,
caption, visibility); `<EvidenceGallery>` / `<EvidenceUploader>` (mobile camera capture photo/video); contractor document
sharing by metadata (share to project-wide contractors / specific agreements / specific principal; shared by/at;
acknowledgement required + acknowledged by/at) - no file copies; drawings register (number, discipline, title, revision,
issue date, status, supersedes, project/location, distribution list, contractor visibility, acknowledgement); publishing
Rev N marks previous current revision superseded (kept); contractor portal documents + plans (current revision obvious,
acknowledge). Events `plan.revision.published`, `document.shared`, `plan.revision.acknowledged`.

### KL - RFI + Submittals (slot 0163, registry `rfi`)
Own: `src/modules/rfi/**`, `src/modules/submittals/**` (new), `drizzle/schema/dg-rfi-submittals.ts`, routes per table
(KL), namespaces `rfi`, `submittals`.
RFI: project, contractor, subject, question, location, drawing/revision ref, work package, due date, assignee,
attachments (evidence API); draft -> submitted -> under_review -> answered -> closed, audited reopen; raised by internal
or contractor (`ext.rfi.raise`); official answer append-only. Submittals: types (product, equipment, sample, technical
data, catalogue, shop drawing, material), revisions kept, review states approved / approved_with_comments /
revise_and_resubmit / rejected; contractor submits (`ext.submittal.submit`). Events `rfi.request.submitted|answered|
closed`, `submittal.package.submitted|reviewed`.

### MN - Inspections / quality + Defects / punch list (slot 0164, registry `quality`)
Own: `src/modules/inspections/**`, `src/modules/defects/**` (new), `drizzle/schema/dg-quality.ts`, routes per table (MN),
namespaces `inspections`, `defects`.
Inspections: templates/checklists (waterproofing, pre-pour, electrical panel, pressure test, ceiling closure, fire,
aluminium...), location, contractor, work line/milestone links, result pass / conditional_pass / fail, evidence; fail
creates defect and/or corrective task (`createLinkedTask`). Defects: project, location, responsible contractor, title,
description, severity, due date, media, inspector, open -> assigned -> completion_submitted -> verification -> closed or
reopened, every repair cycle kept; contractor works defects in portal (`ext.defect.work`); also usable as warranty
defects (Track Q links). Events `quality.inspection.completed|failed`, `defect.item.opened|assigned`,
`defect.completion_submitted`, `defect.item.closed|reopened`.

### O - Daily site log / meetings / site instructions (slot 0165, registry `field`)
Own: `src/modules/site-log/**`, `src/modules/site-instructions/**` (new), project-scoped contractor-meeting extensions
via a new module `src/modules/site-meetings/**` that REUSES existing `meetings` tables where they fit (read
`src/modules/meetings` and `drizzle/schema` meetings tables first; extend additively), `drizzle/schema/dg-field.ts`,
routes per table (O), namespace `siteOps`.
Daily log per date: contractors present, work performed, manpower, equipment, deliveries, delays, blocking issues,
inspections, safety events, instructions, photos/video, notes - no field mandatory; contractors may submit their daily
report (`ext.daily_log.submit`). Meetings: weekly contractor / site / design / consultant; attendees (internal +
contractor principals/vendors), agenda, minutes, decisions, attachments, action items that create real tasks.
Site instructions: operational / potentially financial / urgent-before-price; issued -> acknowledged -> performed ->
closed (contractor ack `ext.site_instruction.ack`); potentially financial instruction can be converted to an E change
or unpriced work by storing a link (`entity_links`) and calling Track E's exported use-case if available, otherwise
request it. Events `field.daily_log.submitted`, `field.instruction.issued|acknowledged`, `field.meeting.published`.

### P - Contractor compliance / safety / deliveries (slot 0166, registry `compliance`)
Own: `src/modules/contractor-compliance/**`, `src/modules/deliveries/**` (new), additive extensions of
`src/modules/safety` for contractor/project linkage (read it first; reuse its tables), `drizzle/schema/dg-compliance-safety.ts`,
routes per table (P), namespaces `contractorCompliance`, `deliveries` (+ safety strings in `contractorCompliance`).
Compliance: requirement sets per agreement/project (insurance, guarantees, tax certificates, bookkeeping certificate,
safety certification, licenses, custom), required/optional, expiry, status missing/current/expired/expiring, reminders,
contractor uploads (`ext.compliance.submit`), reuse existing `compliance` artifacts where semantically right; export a
pure/query port `getPaymentEligibilityInputs(db, org, agreementId)` for Track F holds. Safety: observation / hazard /
incident / corrective action, contractor, evidence, due date, closure verification, corrective tasks via
`createLinkedTask`, contractor reports (`ext.safety.report`). Deliveries: critical material/equipment tracking
(responsible contractor, item, supplier, order date, expected/actual delivery, state, location, work package, docs,
photos), contractor reports (`ext.delivery.report`). Events `compliance.document.expiring|expired|submitted`,
`safety.record.reported|closed`, `delivery.item.delayed|delivered`.

### Q - Procurement / award / closeout / warranty / performance (slot 0167, registry `procurement`)
Own: `src/modules/contractor-procurement/**`, `src/modules/contractor-closeout/**`, `src/modules/contractor-performance/**`
(new; reuse existing `procurement`, `closeout`, `warranty` modules/tables where semantically right - read them first),
`drizzle/schema/dg-procurement-closeout.ts`, routes per table (Q), namespaces `awards`, `handover`.
Procurement: tender package (required trade, scope, candidate vendors, invitations, offers via portal `ext.bid.submit`
for invited vendors only, commercial comparison, selection, award -> creates a DRAFT subcontract agreement through
Track E's exported use-case or a minimal insert into `subcontract_agreements` consistent with existing vendor module
rules). Never mix with customer quotes. Closeout: per-agreement checklist (punch list clear, final claim, final invoice,
as-built, O&M, warranties, certificates, inspections, training, final account, retention release, guarantees);
contractor uploads (`ext.handover.submit`); contract close requires all required items or authorized override with
reason. Warranty: per contractor warranty period/docs; warranty defects reuse Track MN defects (link by entity_links);
retention/guarantee implications flagged. Performance: factual metrics only (task timeliness, defect reopen rate, RFI
response, claim variance, readiness, compliance, inspection pass rate) with transparent formula; no AI score.
Events `procurement.tender.awarded`, `closeout.agreement.closed`, `warranty.claim.reported`.

### R - Contractor portal shell + mobile UX (no slot)
Own: `src/app/[locale]/contractor/(portal)/layout.tsx`, `page.tsx`, `projects/[projectId]/page.tsx`, `notifications/**`,
`src/modules/contractor-portal/**`, namespace `contractorPortal`. Mobile-first shell (bottom nav), project switcher across
grants, dashboard/today per permissions (today, upcoming events, acknowledgement requests, tasks, overdue, milestones,
plan revisions, RFIs, defects, submittals, claims, certification results, retention, payments, documents, notifications)
composed from each domain module's exported portal summary queries (request missing ones), PWA-friendly.

### S - Internal project workspace / dashboard / Contractor 360 / cost control (slot 0170, registry `surfaces`)
Own: project layout/tabs/nav files under `src/app/[locale]/(app)/projects/[projectId]/` (`project-tab-order.ts`,
`project-tabs-*`, `project-workspace-nav.tsx`, `project-hub-*`), routes per table (S), `src/modules/project-workspace/**`,
`drizzle/schema/dg-surfaces.ts`, namespace `projectWorkspace`. Integrate every route in section 2 into coherent project
navigation (an "Execution / ביצוע" group visible when the project has a developer/GC profile or contractors), execution
dashboard, financial dashboard (financial caps only), Contractor 360 with tabs embedding each domain's panels, cost
control per trade/work package (original budget, approved budget, committed, approved changes, revised commitment,
submitted claims, certified, AP actual, paid, retention, forecast remaining/final) - never mixing these numbers.

### T - Notifications / domain-event consumers / Command Center (slot 0169, registry `notifications`)
Own: `src/modules/notifications/**` (additive), `src/modules/command-center/**` (additive), `src/modules/dg-events/**`
(new consumer worker), `drizzle/schema/dg-notifications.ts`. Domain-event consumer (service role, idempotent,
processed_at/attempts) mapping events -> notifications for internal users (project capability holders) and external
principals (grant holders of the vendor/agreement) with dedupe/anti-spam, deep links, unread/read; external
notification center data for the portal; Command Center items (claim awaiting review, blocked event, overdue
acknowledgement, critical task overdue, defect awaiting verification, RFI overdue, expiring compliance, pending
submittal, payment eligibility blocked). Wire the worker like existing ops workers (`src/app/api/internal/ops-worker`).

### U - Search / global create / navigation (no slot)
Own: `src/modules/search/**` (additive), global FAB files, global nav. Search for contractor, task, event, claim (financial
cap), RFI, submittal, defect, drawing, location, document, meeting, instruction with authorization in discovery and
metadata. FAB entries (contractor contract, task, coordination event, RFI, submittal, defect, inspection, instruction,
claim) with project prefill.

### V / W / X / Y - i18n review, security review, E2E/regression, migration consolidation
Run after domain tracks land. V: 4-locale parity + RTL review. W: authorization matrix (Owner, full-financial PM,
operational PM, Site Manager, Finance, Contractor A, Contractor B). X: workflow E2E + regression. Y: MAIN AGENT.
