# Master Wave — Agent 2: Temporal Employee ↔ Project Assignments

**STATUS:** COMPLETE  
**Owner:** Agent 2  
**Contract:** `_MASTER-WAVE-LEAD-CONTRACT.md`  
**Forbidden (obeyed):** commit/push; `db:migrate`; edit migrations; create Actual from assignment; weaken RLS  

---

## 1. Verdict

Replace static `project_team_members` (unapplied 0021) with a **temporal** assignment table. Assignment is planning/roster only: it never writes time entries, labor cost snapshots, expense Actuals, or monthly employer cost.

Locked chain:

`EMPLOYEE MASTER ≠ COMPENSATION HISTORY ≠ PROJECT ASSIGNMENT ≠ TIME ENTRY ≠ MONTHLY EMPLOYER COST ≠ COST ALLOCATION`

`ASSIGNMENT ≠ Actual`

---

## 2. Recommended table name

**`employee_project_assignments`**

| Candidate | Why not / why |
|-----------|----------------|
| `project_team_members` | Static roster semantics; unique `(project, employee)` blocks history + re-hire |
| `project_assignments` | Ambiguous vs RBAC / assets |
| **`employee_project_assignments`** | Clear employee↔project span; distinct from `role_assignments` |

Drizzle export: `employeeProjectAssignments`.

---

## 3. Schema proposal (for Lead — redesigned 0021)

### 3.1 Columns

| Column | Type | Null | Notes |
|--------|------|------|-------|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `organization_id` | uuid → `organizations` CASCADE | NO | Tenant |
| `project_id` | uuid | NO | Composite FK with org → `projects(id, organization_id)` CASCADE |
| `employee_id` | uuid | NO | Composite FK with org → `employees(id, organization_id)` CASCADE |
| `start_date` | date | NO | Inclusive |
| `end_date` | date | YES | Inclusive; **NULL = open-ended** |
| `role` | text | YES | Free-text crew role (foreman, electrician…) — not RBAC |
| `planned_allocation_percent` | numeric(9,6) | YES | Planning hint only (0–100). **Not** cost allocation / Actual |
| `notes` | text | YES | |
| `status` | text CHECK | NO | Default `'active'`. Values: `active` \| `completed` \| `cancelled` |
| `created_at` / `updated_at` | timestamptz | NO | Standard timestamps |

**No** money, rate, hours, or Actual FKs on this table.

### 3.2 Constraints & indexes

```text
CHECK (end_date IS NULL OR end_date >= start_date)
CHECK (status IN ('active', 'completed', 'cancelled'))
CHECK (
  planned_allocation_percent IS NULL
  OR (planned_allocation_percent >= 0 AND planned_allocation_percent <= 100)
)

UNIQUE (id, organization_id)     -- tenancy pattern (match other 0021 tables)
INDEX (organization_id)
INDEX (project_id)
INDEX (employee_id)
INDEX (organization_id, project_id, start_date)   -- project roster as-of
INDEX (organization_id, employee_id, start_date)  -- employee שיוכים as-of
```

**Overlap (same employee + same project only):**

- Forbid overlapping date ranges for `(organization_id, employee_id, project_id)` among rows where `status <> 'cancelled'`.
- Mirror `rate_versions` pattern: `daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]')` + trigger/exclusion.
- **Do not** forbid concurrent assignments to **different** projects (multi-project OK).

**Do not** enforce sum(`planned_allocation_percent`) ≤ 100 across projects — soft UX warning only (over-allocation can be legitimate).

### 3.3 RLS (preserve strength)

Same org-member policies as draft `project_team_members` in unapplied 0021:

- `ENABLE` + `FORCE ROW LEVEL SECURITY`
- `authenticated`: SELECT/INSERT/UPDATE/DELETE via `app.is_org_member(organization_id)`
- `service_role`: ALL

Lead: swap table name in the 0021 RLS loop; do not weaken predicates.

### 3.4 How to migrate / replace `project_team_members` in redesigned 0021

0021 is **unapplied** → no data backfill.

1. **Remove** entire `project_team_members` DDL + its RLS array entry from redesigned 0021.
2. **Add** `employee_project_assignments` DDL + constraints + overlap trigger + RLS.
3. **Update** `drizzle/schema/workforce.ts`: drop `projectTeamMembers*`; add `employeeProjectAssignments*`.
4. **Update** journal/tests that assert `project_team_members` name/unique key.
5. App: treat “add to צוות” as insert with `start_date = today` (or form date), `end_date = null`, `status = 'active'`.
6. “Remove from צוות” = **end**, not hard-delete: set `end_date` (and optionally `status = 'completed'`). Use `cancelled` for mistaken rows that should leave active/history filters. Hard DELETE only for admin cleanup of never-used mistakes (optional; not required for V1).

### 3.5 Derived “current roster”

As-of date `D` (default today):

```text
status = 'active'
AND start_date <= D
AND (end_date IS NULL OR end_date >= D)
```

History = all non-cancelled rows (or all rows) for project/employee, ordered by `start_date DESC`.

Repeat assignments over time = new row after prior `end_date` (no unique on `(project, employee)`).

---

## 4. Domain rules (application)

| Rule | Behavior |
|------|----------|
| Assignment ≠ Actual | Insert/update/end/cancel write **only** this table (+ audit). Never call labor cost, expense Actual, AP recognition, or time-entry create. |
| Assignment ≠ time entry | Time may be logged without assignment (simple mode). Assignment may exist with zero hours. |
| Multi-project | Concurrent open assignments across projects allowed. |
| Same project overlap | Reject overlapping active/completed spans for same employee+project. |
| Optional advanced | Simple mode works with zero assignment rows. Roster UI remains optional advanced workforce. |
| Hours on roster UI | Secondary aggregate from `time_entries` only — display evidence, not membership cost. |

Suggested audit actions (Lead / shared audit):

- `employee_project_assignment.created`
- `employee_project_assignment.ended` (set end_date)
- `employee_project_assignment.cancelled`
- `employee_project_assignment.updated` (role / % / notes / dates)

Deprecate `project_team_member.added` / `.removed` once app switches.

---

## 5. UX notes

### 5.1 Project → צוות (Time / team tab)

- Default list: **current** assignments (as-of today).
- Secondary control: show **היסטוריה** (ended/cancelled + past spans).
- Add form (simple): employee + optional role. Defaults: `start_date = today`, open-ended.
- Advanced (collapsed): start/end, planned %, notes.
- End action: “סיים שיוך” → set `end_date` (confirm). Copy: ending assignment does not delete time or change Actual.
- Concurrent multi-project employees appear on each project’s current roster independently.

### 5.2 Employee → שיוכים

- Rename framing from static “projects list” to **שיוכים** with date range + status.
- Current vs past sections (or filter chips).
- Quick assign: pick project + start (default today); optional role.
- Hours summary remains secondary (“from time entries”).

### 5.3 Mobile quick assign (Agent 5 coordination)

- Minimal sheet: Employee + Project + Start (default today) + Save.
- No required %, end date, or notes on first paint.
- Success toast: assignment saved; **no cost created**.
- Prefer deep-link from Project צוות and Employee שיוכים.

### 5.4 Copy invariants (EN/HE)

Keep existing “assignment ≠ labor Actual” messaging; extend for temporal end (“historical assignments remain visible; Actual unchanged”).

---

## 6. App impact list (current `project_team_members` consumers)

Lead/integrator must retarget these when 0021 is redesigned. **Agent 2 did not edit migrations or wire production paths to the new table.**

### Schema / migration / tests

| Path | Change |
|------|--------|
| `drizzle/migrations/0021_project_contacts_and_team.sql` | Lead: replace table (Agent 2 must not edit) |
| `drizzle/schema/workforce.ts` | `projectTeamMembers` → `employeeProjectAssignments` |
| `tests/unit/database/migration-journal.test.ts` | Assert new table/constraint names |
| `tests/integration/projects/0021-contacts-team-integrity.test.ts` | Temporal uniqueness/overlap + FKs/RLS |
| `tests/integration/workforce/project-team.test.ts` | Rewrite for assignments |
| `tests/unit/workforce/project-team-assignment.test.ts` | Keep “no Actual” source/runtime guards; rename symbols |

### Application / data / validation

| Path | Change |
|------|--------|
| `src/modules/workforce/data/project-team.repository.ts` | Queries: as-of list, history, overlap-aware insert, end/cancel |
| `src/modules/workforce/application/project-team.ts` | API: create / end / cancel / list current / list history; still no Actual |
| `src/modules/workforce/application/quick-log.ts` | Prefer **current** assignment employee IDs for picker ordering |
| `src/modules/workforce/validation/schemas.ts` | start/end, %, status; endAssignment schema |
| `src/modules/workforce/domain/types.ts` | Temporal types (stub added — see §8) |
| `src/modules/workforce/index.ts` | Export new APIs/types when wired |

### UI / routes / i18n / audit

| Path | Change |
|------|--------|
| `src/modules/workforce/ui/project-team-roster.tsx` | Current + history; end vs remove |
| `src/modules/workforce/ui/employee-projects-panel.tsx` | שיוכים with dates/status |
| `src/modules/workforce/ui/project-time-panel.tsx` | Load current roster |
| `src/modules/workforce/ui.ts` | Export names if renamed |
| `src/app/[locale]/(app)/workforce/team/actions.ts` | Server actions for create/end |
| `src/app/[locale]/(app)/workforce/employees/[employeeId]/page.tsx` | Pass temporal links |
| `src/app/[locale]/(app)/projects/[projectId]/page.tsx` | Via `ProjectTimePanel` |
| `src/app/[locale]/(app)/jobs/[jobId]/page.tsx` | Via `ProjectTimePanel` |
| `src/locales/en/workforce.json` | Temporal + history strings |
| `src/locales/he-IL/workforce.json` | צוות / שיוכים copy |
| `src/locales/*/settings.json` | Audit action labels |
| `src/shared/audit/actions.ts` | New assignment audit keys |

### Docs that mention static team (informational)

- `docs/product/_OWNER-QA-FINAL-LEAD-CONTRACT.md`
- `docs/product/_OWNER-QA-LEAD-CONTRACT.md`

---

## 7. Schema asks for Lead

1. **Confirm table name** `employee_project_assignments` (vs keep legacy name with temporal columns — not recommended).
2. **Overlap policy:** exclude same employee+project date overlap for non-cancelled rows? (**Recommend yes.**)
3. **Status column vs dates-only?** (**Recommend keep `status`** so cancel ≠ end; completed may be derived or set on end.)
4. **Inclusive `end_date`?** (**Recommend yes**, match `rate_versions` style.)
5. **Hard DELETE allowed?** V1: end/cancel only; delete optional for admins.
6. **`planned_allocation_percent`:** planning-only; no finance consumer in this wave — confirm Agent 3/4 must not treat it as cost weight.
7. **Simple mode:** time entry without assignment remains allowed? (**Recommend yes.**)
8. **Audit:** replace vs alias `project_team_member.*` actions.
9. **Composite FKs + RLS:** same strength as draft 0021 team table.
10. **Enum type:** Postgres enum vs text CHECK — Lead preference (CHECK is fine for V1).

---

## 8. Optional domain stub (shipped)

File: `src/modules/workforce/domain/types.ts`

- `EMPLOYEE_PROJECT_ASSIGNMENT_STATUSES`
- `EmployeeProjectAssignmentRecord`
- `EmployeeProjectAssignmentSummary` (project צוות row)
- `EmployeeAssignmentLink` (employee שיוכים row)

Existing `ProjectTeamMember*` types remain until Lead cuts over app code. No migration, repository, or Actual wiring added.

---

## 9. Tests run

None required for this proposal-only delivery. Existing unit guards still target static team member sources until Lead rewires.

---

## 10. Findings

### BLOCKER

_None._ Unapplied 0021 can be replaced cleanly.

### HIGH

1. **Static unique `(project_id, employee_id)` must die** — blocks history and re-assignment; Lead must not keep it on the temporal table.
2. **End ≠ delete** — hard remove destroys history UX and audit story; default to `end_date` / `cancelled`.
3. **Assignment must stay off Actual paths** — preserve unit/integration “no labor/expense Actual” invariants after rename.

### MEDIUM

1. Soft warning when sum of current `planned_allocation_percent` > 100 (UX only).
2. Coordinate Hebrew labels with Agent 5 (צוות vs שיוכים vs mobile quick assign).
3. Quick-log picker should use **as-of** assignments, not all historical rows.
4. Docs/tests still naming `project_team_members` will fail Full Gate until Lead updates 0021 + assertions.
