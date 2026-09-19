---
name: universal_work_management
overview: "V3.1: Self-contained implementation contract — system actor for recurrence/automation, explicit task project context in shared workspaces, access-safe aggregation, one-click release. Planning only — no implementation."
todos:
  - id: wave0-foundation
    content: "Wave 0: Verify migration number, write migrations N+0 to N+6 (workspaces + core entities), extend permission catalog, org profile + module seeding"
    status: pending
  - id: agentA-task-core
    content: "Agent A: Build src/modules/tasks/ — domain, application, data, validation (task entity, CRUD, assignments, dependencies, recurrence)"
    status: pending
  - id: agentB-board-list
    content: "Agent B: Build Board/Kanban UI + My Work + workspace routes (work/, workspaces/, projects/[id]/boards/)"
    status: pending
  - id: agentC-portfolio-workload
    content: "Agent C: Build Portfolio view + Team Workload (server-side aggregation, paginated, no N+1)"
    status: pending
  - id: agentD-calendar-timeline
    content: "Agent D: Extend Calendar with task dates, add Gantt write UI for planning_work_items, milestone extensions"
    status: pending
  - id: agentE-comments-activity-approvals
    content: "Agent E: Build task_comments, task_activity log, wire task approval gate into existing /approvals"
    status: pending
  - id: agentF-templates-stages-labels
    content: "Agent F: Build stage CRUD, label management, task templates, project templates, org profile type seeding"
    status: pending
  - id: agentG-today-notifications-automations
    content: "Agent G: Extend Today source types, notifications event types, automations trigger/action types for tasks"
    status: pending
  - id: agentH-employee-permissions
    content: "Agent H: Extend employee app with task entity, new permission keys end-to-end, preset updates"
    status: pending
  - id: wave3-polish
    content: "Wave 3: Navigation, i18n (4 locales), mobile sweep, reporting additions, settings pages"
    status: pending
  - id: wave4-qa-release
    content: "Wave 4: Scale verification, full preflight, continuous release to production smoke (Lead-owned)"
    status: pending
  - id: agentI-operations-adoption
    content: "Agent I: Operations Dashboard, meetings/decisions, org adoption/seeding, module enablement, global search + reports integration"
    status: pending
isProject: true
---

# ProjectFlow — Universal Work Management Master Plan (V3.1)

## PLANNING ONLY — NO IMPLEMENTATION YET

### THIS DOCUMENT IS THE COMPLETE IMPLEMENTATION CONTRACT

Once the Owner approves and presses **Build / Implement**, the implementing Lead executes this document end-to-end without depending on chat instructions, external handoffs, hidden assumptions, or additional Owner decisions.

- Minor technical choices during implementation: Lead chooses the safest option consistent with this document
- Real blockers making approved architecture impossible: Lead reports **BLOCKED** with evidence — do not pause for routine choices
- After approval, required Owner action = **CLICK BUILD ONLY**

---

## A. EXISTING CAPABILITY MAP

Based on four parallel codebase exploration sweeps across 223 DB tables, 181 routes, and 70+ modules.

### Projects & Planning
- **Projects (CRUD, templates, multi-contract, access control)** — FULL
- **Work Packages / Phases** — FULL
- **Milestones** — FULL
- **Planning items / Gantt schema (`planning_work_items`)** — PARTIAL (domain + DB full; no user-facing write UI; CPM returns `supported:false`)
- **Project "Stages"** — NOT FOUND (CRM has pipeline stages; projects do not)
- **Task entity (PM tasks, assignable, statusable)** — NOT FOUND (no `tasks` table; punch-list items ≠ PM tasks)
- **Board / Kanban for tasks** — NOT FOUND (CRM board, dispatch board, scheduling board exist — none for PM tasks)
- **My Work (cross-project task view)** — NOT FOUND
- **Portfolio rollup** — NOT FOUND (project list with filters exists; no aggregated health/task rollup)
- **Team Workload view** — NOT FOUND (scheduling capacity exists; no PM workload)

### Workforce / Permissions / Today
- **Employees / HR / time / attendance** — FULL
- **Employee App (PIN, scoped grants, mobile shell)** — PARTIAL (Wave 0 Lead verifies migration state automatically — see section R)
- **RBAC (roles, grants, RLS)** — FULL
- **Today / Command Center** — FULL (40+ source types, state persistence)
- **In-app Notifications** — PARTIAL (in-app complete; email/push stubbed)
- **Approvals** — PARTIAL (multi-domain, but fragmented inbox; RLS gap documented)
- **Audit / Activity logs** — FULL
- **Comments (threaded, entity-attached)** — NOT FOUND

### Documents / Storage / Finance
- **Documents + all four external storage providers** — FULL
- **CRM / Clients / Vendors / Subcontractors** — FULL
- **Billing / AR / Statutory invoicing** — FULL
- **AP / Procurement / PO** — FULL
- **Change orders** — FULL
- **Financial calculations / Reports / Dashboards** — FULL
- **Quick Access** — FULL
- **Calendar (native events + date projections)** — PARTIAL (no external calendar sync)
- **Custom fields** (`text, number, money, date, select, multi_select, boolean, reference`) on 6 entity types — FULL
- **Saved views** (per-list URL filter persistence) — FULL for existing lists
- **Global search** (40 entity kinds) — FULL
- **Templates** (org structure, form, billing plan, role) — PARTIAL (no task templates, no project-stage templates)
- **Recurring drafts** (financial recurring) — FULL
- **Automations** (`automation_rules`, triggers for financial/workforce) — PARTIAL (no task triggers)

---

## B. TARGET PRODUCT ARCHITECTURE

### Canonical hierarchy (resolved)

```
Workspace / Plan                    ← container (project-linked OR org-internal OR team)
  └── Board                         ← multiple per workspace; one optional default
        └── Bucket                  ← user-configurable column (NOT canonical status)
              └── Task              ← canonical PM entity
```

Organization-level and department work lives in **org-internal or team workspaces** — no fake project/client required.

```
Organization Profile (org_profile_type, terminology_config, module_enablement)
│
├── Operations Dashboard (/operations) ─ permission-aware work overview [NEW]
├── Portfolio View (/portfolio) ─ cross-project health rollup
│
├── Workspaces (canonical container)
│   ├── Project-linked workspace(s) ─ 0..N per project (Design, Licensing, Construction, Handover…)
│   ├── Organization/internal workspace ─ org-wide initiatives, no project required
│   └── Team/department workspace ─ where justified
│       └── Boards (multiple; default + archive supported)
│           └── Buckets → Tasks
│
├── Projects (existing) ─ extended with Stages + workspace links
│   ├── Stage (configurable per org + immutable transition history)
│   ├── Milestones (existing, extended)
│   ├── Planning / Timeline (existing planning_work_items, extended write UI)
│   └── Financial workspace (unchanged — read-only from task context)
│
├── My Work (/work) ─ cross-workspace task aggregation (boards transparent to user)
├── Team Workload (/workload)
├── Calendar ─ extended with task due dates + milestones
├── Today ─ extended with task alerts
├── Templates ─ task + stage + project templates + org adoption seeding
├── Meetings (/meetings) ─ structured attendees, notes, decisions, action items
└── Employee App ─ PM Tasks tab + existing Punch/Safety/Field tab (both preserved)
```

### Core Principle
One canonical `tasks` table. Profession-specific behavior comes from org profile, module enablement, templates, stage configuration, and terminology — not separate engines.

`planning_work_items` remains the **schedule/Gantt layer** (date-driven, Gantt rendering, critical path foundation). `tasks` is the **PM task layer** (status-driven, assignable, boardable). They can optionally link but serve different concerns.

### Module enablement (UX/navigation only)

`organizations.module_config` JSONB (or dedicated `organization_module_settings` table if Lead prefers normalized storage):

- Controls **navigation visibility**, default surfaces, and quick-access shortcuts only
- Does **NOT** delete data, hide financial truth, or alter calculations
- Owner can enable/disable modules at any time in Settings
- Defaults seeded by `org_profile_type` at org creation **and** via idempotent adoption for existing orgs

Example defaults:

| Module | Architect | Contractor |
|---|---|---|
| Projects, Tasks, Portfolio, Time, Documents, Billing, Profitability | ON | ON |
| Procurement, AP, Subcontracts, Expenses | OFF | ON |

Settings UI: `/settings/modules` — toggle per module with permission `modules.manage`.

---

## C. DATA MODEL

### New Tables

| Table | Classification | Purpose |
|---|---|---|
| `workspaces` | NEW | Canonical work container: `org_id`, `name`, `workspace_type` (project_linked \| org_internal \| team), `workspace_visibility` (organization \| restricted \| team), optional `org_team_id` (when type=team), `is_archived`, `is_read_only`, `closed_at`, `created_by_org_member_id`. **NO `project_id`** — project relation is ONLY via links |
| `project_workspace_links` | NEW | **Single source of truth** for workspace ↔ project membership: `workspace_id`, `project_id`, optional `relationship_role`, `linked_at`, optional `link_closed_at`. **UNIQUE (`workspace_id`, `project_id`)**. Project 0..N workspaces; workspace 0..N projects |
| `workspace_members` | NEW | Access for org_internal / restricted / team workspaces: `workspace_id`, `org_member_id` OR `employee_id` (CHECK one), `access_level` (viewer \| contributor \| manager), `added_at`, `added_by_org_member_id` |
| `org_teams` | NEW | Org-scoped team entity (no existing Team table in ProjectFlow): `org_id`, `name`, `manager_org_member_id` nullable, `is_archived` |
| `org_team_members` | NEW | Team roster: `org_team_id`, `org_member_id` OR `employee_id` (CHECK one), `added_at` |
| `project_stage_definitions` | NEW | Org-defined stage catalog (name, color, position, is_default, work_kind filter) |
| `project_stage_transitions` | NEW | Immutable stage history: `project_id`, `from_stage_id` (NULL = initial), `to_stage_id`, `transitioned_at`, `transitioned_by_org_member_id`, `notes`. **Current stage** = latest row `ORDER BY transitioned_at DESC, id DESC` — no separate current-stage table |
| `task_boards` | NEW | Multiple per workspace; `workspace_id`, `name`, `position`, `is_default`, `is_archived`, `archived_at` |
| `task_buckets` | NEW | Configurable columns per board: name, `sort_key`, board_id, color, optional wip_limit, **`status_on_enter` nullable** (canonical status applied on bucket entry when configured) — bucket ≠ status |
| `tasks` | NEW | Core entity (section F): `workspace_id`, optional `project_id` (context), creator org_member \| employee \| system |
| `task_assignees` | NEW | Many-to-many tasks ↔ assignable actors (see Actor Model) |
| `task_checklist_items` | NEW | Checklist rows per task (title, done, sort_key, due_date, assignee) |
| `task_dependencies` | NEW | finish-to-start and blocked-by; cycle-prevention enforced in domain |
| `task_comments` | NEW | Flat comments per task (threading EXCLUDED — see Scope Classification) |
| `task_activity` | NEW | Append-only task event log (status change, reassign, due date change, etc.) |
| `task_labels` | NEW | Org-defined labels (name, color, org_id) |
| `task_label_assignments` | NEW | Many-to-many tasks ↔ labels |
| `task_recurrence_rules` | NEW | Master recurrence: `rrule` text, `timezone`, `starts_at`, `ends_at`, `max_occurrences`, template task reference |
| `task_recurrence_occurrences` | NEW | Per-occurrence identity: `rule_id`, `occurrence_at` (timestamptz, timezone-safe), `status` (pending \| generated \| skipped \| cancelled), `generated_task_id`. **UNIQUE (`rule_id`, `occurrence_at`)** — structural idempotency |
| `task_templates` | NEW | Reusable task definition (title, desc, checklist, labels, defaults) |
| `task_template_items` | NEW | Items inside a project/stage template |
| `project_templates` | NEW | Named project template (stage set + task set + milestones + default boards) |
| `project_template_stages` | NEW | Stage sequence within a project template |
| `project_template_tasks` | NEW | Task definitions within a template stage |
| `meeting_records` | NEW | Meeting log: title, date, optional `project_id`, `workspace_id`, notes |
| `meeting_attendees` | NEW | Structured attendees: `org_member_id` OR `employee_id` OR `contact_id` OR `display_name` fallback — not `attendees_text` only |
| `meeting_decisions` | NEW | Canonical decision (≠ task): title, body, decided_at, `decided_by_org_member_id` OR `decided_by_employee_id` (CHECK one) |
| `meeting_action_items` | NEW | Action items from meeting/decision → optionally creates/links `task_id` |
| `task_followers` | NEW | Org members watching a task (for notifications) |

### Extend Existing Tables

| Table | Extension | Notes |
|---|---|---|
| `organizations` | Add `org_profile_type` enum, `terminology_config` JSONB, `module_config` JSONB | Profile + label overrides + module visibility |
| `custom_field_definitions` | Add `task` to entity_type enum | Reuse full CF infrastructure |
| `saved_list_views` | Add list keys; add `scope` (`private` \| `organization`); org-shared views use nullable `created_by_org_member_id` (private views retain owner reference) | Extend now — not task actor fields |
| `time_entries` | Add optional nullable `task_id` FK | Operational context only; payroll/labor truth unchanged |
| `notifications` | Add task event types to notification copy | No schema change needed |
| `automation_rules` | Add task trigger/action types | Extend enum |
| `document_links` | Add `task` to `owner_type` enum | Attach documents to tasks |
| `project_milestones` | Add `task_id` FK (optional link) | Milestone ↔ task relationship |
| `projects` | Add `closed_at`, `is_read_only` (or reuse `is_archived` with explicit close semantics) | Closeout preserves all linked data |
| `command_center_item_states` | No change needed (source types added in code) | Task alerts are computed |
| `planning_work_items` | Add optional `task_id` FK | Optional schedule ↔ task link |
| `employee_permission_grants` | Add task permission scopes | Employee app task access |
| `approval_requests` | Add `task` to entity_type (if not present) | Multiple requests per task = approval history |

### Reuse Without Change

| Infrastructure | Reused for |
|---|---|
| `custom_field_definitions` / `custom_field_values` | Task custom fields |
| `document_links` | Task attachments |
| `audit_events` | Task-level audit (supplement `task_activity`) |
| `approvals` / `approval_requests` | Task approval requirement |
| `employee_project_assignments` | Project-linked workspace assignment candidate scope only |
| `project_access_grants` | Project-linked workspace visibility (with workspace_members for non-project workspaces) |
| `notifications` table | Task notification delivery |
| `calendar_events` + `source-dates.repository` | Task due dates in calendar |

### NOT Needed (avoid duplication)

- Second Gantt engine — reuse `planning_work_items` + extend write UI
- Second notification center — extend existing
- Second approval inbox — extend existing `/approvals`
- Second document storage — extend `document_links` owner_type
- Second permission system — extend permission catalog

### Workspace ↔ Project (membership vs task context)

```
projects ←—— project_workspace_links ——→ workspaces → boards → buckets → tasks
                                              ↑
                                    tasks.project_id = explicit PROJECT CONTEXT (when set)
```

**Two distinct concepts (do not conflate):**

| Concept | Source of truth | Purpose |
|---|---|---|
| Workspace ↔ Project **membership** | `project_workspace_links` ONLY | Which projects a workspace serves |
| Task **project context** | `tasks.project_id` (nullable) | Which project this task belongs to for attribution, closeout, portfolio KPIs |

- `workspaces` has **NO `project_id` column**
- A workspace may link to **multiple projects**; a project may link to **multiple workspaces**
- **`project_workspace_links`:** UNIQUE (`workspace_id`, `project_id`)

#### Task project context rules (`tasks.project_id`)

When non-null, `tasks.project_id` is the **authoritative project attribution** for that task — NOT workspace membership, NOT a cache.

**A. Workspace linked to exactly one project**

- Default on create: `tasks.project_id` = that linked project (auto)
- User may still mark workspace-wide (`project_id = NULL`) if product allows intentional org-wide task in single-project workspace

**B. Workspace linked to multiple projects**

- Task creation MUST require either:
  1. **Explicit project context** selected → `tasks.project_id` set, OR
  2. **Intentional workspace-wide task** → `tasks.project_id = NULL`

**C. Validation (domain + DB where practical)**

- If `tasks.project_id IS NOT NULL`, a row MUST exist in `project_workspace_links` for `(tasks.workspace_id, tasks.project_id)`
- Server actions enforce before insert/update; migration adds composite FK or validated trigger

**D. Access in shared project workspaces**

| Task type | Caller needs |
|---|---|
| `project_id = ProjectA` | workspace access **AND** ProjectA access |
| `project_id = NULL` (workspace-wide) | workspace access (explicit member/manager, or org admin); **NOT** granted merely because caller has access to one linked project |

**E. Workspace discovery vs task visibility**

- User may open/discover shared workspace if: explicit workspace access **OR** access to ≥1 linked project
- Task rows inside are filtered by rules D — no cross-project leakage

**F. Portfolio attribution**

- Project KPIs count only tasks where `tasks.project_id = that project`
- Workspace-wide (`project_id NULL`) tasks **do not** inflate every linked project's counts — they appear in Operations / Workspace views instead

**G. Project closeout (shared workspace)**

Closing Project A:

| Task | Behavior |
|---|---|
| `project_id = Project A` | Read-only under project-close semantics |
| `project_id = Project B` (same workspace) | Remains editable if Project B open |
| `project_id = NULL` (workspace-wide) | Governed by **workspace** state — NOT frozen because Project A closed |
| Shared workspace | Remains active; NOT globally read-only |

Workspace global read-only **only** via explicit workspace close action.

### Workspace access model

| `workspace_type` | Visibility default | Access resolution |
|---|---|---|
| `project_linked` | Inherits from linked project(s) via `project_access_grants` + `employee_project_assignments` | Plus explicit `workspace_members` if restricted override |
| `org_internal` | `workspace_visibility = organization` → all org members with `tasks.read` | `restricted` → `workspace_members` only |
| `team` | Requires `org_team_id`; members from `org_team_members` + optional `workspace_members` | Team workspace visible to team roster + explicit members |

**`workspace_members` fields:** `workspace_id`, `org_member_id` OR `employee_id`, `access_level` (viewer \| contributor \| manager), `added_at`, `added_by_org_member_id`

**Permission semantics within workspace:**

| Action | Minimum access |
|---|---|
| View workspace/tasks | viewer + `tasks.read` scope covering workspace |
| Create task | contributor + `tasks.create` |
| Assign others | contributor + `tasks.assign` (or manager) |
| Manage boards/buckets | manager + `workspaces.manage` |
| Close workspace read-only | manager + `workspaces.manage` |

**My Work / Portfolio / Operations / Today / Global Search / Workload:** all queries apply **workspace access + task project-context access** in SQL — never fetch org-wide then filter in UI. No inaccessible task titles/counts may leak from shared workspaces.

### Team model (IN SCOPE — new entity)

No canonical Team/Department table exists in ProjectFlow today. This program adds:

- `org_teams` — org-scoped team definition
- `org_team_members` — roster (org_member or employee)
- Team workspaces: `workspace_type = team`, `org_team_id` FK required, `workspace_visibility = team`

Used for: team workspace access, workload grouping, assignment candidate lists.

### Canonical Actor / Assignee Model

Three actor classes: **org_member**, **employee**, **system**.

#### Task creator (`tasks`)

```
created_by_org_member_id  nullable
created_by_employee_id    nullable
created_by_system         boolean NOT NULL DEFAULT false
```

**CHECK — exactly one creator identity:**

| Creator | Fields |
|---|---|
| Owner-app manual / template initiated by human / meeting action by human | `created_by_org_member_id` set |
| Employee App creation (if permitted) | `created_by_employee_id` set |
| Recurrence scheduled generation | `created_by_system = true` |
| Automation without direct human command | `created_by_system = true` |

**Do NOT** attribute scheduled/system work to template creator or rule author.

#### Task activity (`task_activity`)

```
actor_org_member_id  nullable
actor_employee_id    nullable
actor_system         boolean NOT NULL DEFAULT false
```

**CHECK — exactly one actor identity** (same three-way rule).

System events use `actor_system = true` for: `recurrence_generated`, `automation_changed`, `system_generated`, dependency auto-resolved where applicable.

Human events use org_member or employee fields only.

#### Other roles

| Role | Canonical reference | Notes |
|---|---|---|
| **Task owner** | `owner_org_member_id` OR `owner_employee_id` (CHECK exactly one) | Human accountability; not system |
| **Task assignee** | `task_assignees`: `org_member_id` OR `employee_id` (CHECK one per row) | Multi-assignee |
| **Task follower** | `task_followers.org_member_id` | Owner-app watchers |
| **Comment author** | `author_org_member_id` OR `author_employee_id` (CHECK exactly one) | Human only — Employee App uses `author_employee_id` |
| **Meeting/decision actor** | `*_org_member_id` OR `*_employee_id` (CHECK exactly one) | Human only |
| **Approval actor** | Existing `approval_requests` fields | Reuse approvals module |

Rules:
- **Never** use bare `user_id`, `creator_id`, `author_id`, or `actor_id`
- **Never** impersonate human org_member/employee for system/automation/recurrence actions
- `employee_app_accounts` → `employee_id` for Employee App human actors
- Assignee candidates: workspace members / org scope for non-project-context tasks; workspace + project rules when `project_id` set

---

## D. UX / ROUTES / NAVIGATION

### New Primary Routes

| Route | Purpose |
|---|---|
| `/operations` | Operations Dashboard / Work Overview (permission-aware; not financial Owner Dashboard) |
| `/work` | My Work hub (Today / This Week / Overdue / All) — spans all workspaces/boards |
| `/work/board` | Global board (group-by canonical status / assignee / priority / label — NOT project bucket IDs) |
| `/portfolio` | Organization portfolio view |
| `/workload` | Team workload dashboard |
| `/workspaces` | Org-internal + team workspace list |
| `/workspaces/[workspaceId]/boards` | Boards within any workspace |
| `/workspaces/[workspaceId]/boards/[boardId]` | Single board view |
| `/projects/[projectId]/boards` | Project workspace boards (multiple; default highlighted) |
| `/projects/[projectId]/tasks` | Per-project task list (all linked workspaces) |
| `/projects/[projectId]/stages` | Stage management + transition history |
| `/meetings` | Meeting records list |
| `/meetings/[meetingId]` | Meeting detail (attendees, notes, decisions, action items) |
| `/settings/stages` | Org stage catalog |
| `/settings/labels` | Org label management |
| `/settings/modules` | Module enablement toggles |
| `/settings/org-profile` | Org profile type + terminology |
| `/settings/adoption` | Existing-org profile adoption (preview → apply) |
| `/settings/task-templates` | Task template management |
| `/settings/project-templates` | Project template management |
| `/employee/tasks` | PM Tasks tab (existing punch/safety tab preserved separately) |

### Extended Existing Routes

- `/projects` — add stage filter column, health indicator
- `/projects/[projectId]` — add Board tab, Tasks tab, Stages display in header
- `/today` — add task overdue / blocked / assigned alerts
- `/calendar` — add task due dates + milestones
- `/settings/templates` — absorb stage + task templates
- `/notifications` — add task event types
- `/approvals` — add task approval items

### Operations Dashboard (`/operations`) — IN SCOPE

Separate from financial Owner Dashboard (`/`). Permission-aware cards:

- Active projects count, projects by stage
- Due today, overdue, blocked tasks (org or scoped)
- Upcoming milestones (7/14 days)
- Pending approvals snapshot
- Stale projects (no activity N days)
- Team workload snapshot (top load, not fabricated %)
- Recent activity feed (tasks, comments, stage changes)
- Financial cards **only** when user has `financials.read` and module enabled

Route gated by `operations.read` (new permission). Nav: under "Work" group, above Portfolio.

**Access rule:** every card count/query scoped in SQL to caller-accessible workspaces **and** task project-context — never compute org-wide totals and hide links in UI. Shared-workspace tasks filtered per section C rules D–E.

### Navigation Structure (revised)

```
Operations (/operations)     [NEW — work overview, not financial dashboard]
Today (/today)
My Work (/work)              [NEW]
Portfolio (/portfolio)       [NEW]
Workload (/workload)         [NEW]
Workspaces (/workspaces)     [NEW — org/team internal work]

Projects (/projects)         [extended: Boards tab, Stages, Tasks]
Calendar (/calendar)         [extended]

[module-gated sections]
People (/workforce/...)
Money (billing, procurement, expenses...) — hidden if module disabled
Documents, CRM, Reports

Settings (+ modules, org-profile, adoption)
```

Navigation respects `module_config` — disabled modules hidden, data preserved. "Work" accordion group holds Operations, My Work, Portfolio, Workload, Workspaces.

---

## E. PERMISSIONS

### New permission keys (extend `src/shared/permissions/catalog.ts`)

```
tasks.read
tasks.create
tasks.update
tasks.delete
tasks.assign
tasks.manage_all         (manage tasks not assigned to self)
tasks.comment
tasks.approve
portfolio.read
workload.read
operations.read
workspaces.manage
stages.manage
modules.manage
labels.manage
task_templates.manage
project_templates.manage
meetings.read
meetings.manage
```

### Canonical permission scopes (one list — no undefined strings)

| Scope | Semantics |
|---|---|
| `self` | Tasks where current actor is assignee (org_member or employee identity match) |
| `assigned_tasks` | Alias of `self` for employee presets — same semantics |
| `assigned_projects` | All tasks in workspaces linked to projects where employee/user has project assignment/access |
| `workspace` | All tasks in workspaces where user/employee has workspace membership or project-linked access |
| `organization` | All tasks in org (subject to workspace visibility rules) |

Grant storage uses these exact strings in `employee_permission_grants` and role presets.

### Employee App permissions

- `tasks.read` (scope: `assigned_tasks` or `assigned_projects`) — see accessible tasks only
- `tasks.update` (scope: `assigned_tasks`) — update status / checklist on tasks assigned to this employee
- `tasks.comment` (scope: `assigned_tasks`) — add comments as `author_employee_id`
- Employees must NOT gain access to financial facts through task context

### RLS

All new task/workspace tables follow existing `app.install_permissioned_rls()` pattern.

RLS predicates must enforce:
- `workspace_members` / `org_team_members` / `project_access_grants` / `project_workspace_links` jointly
- **Task project context:** when `tasks.project_id IS NOT NULL`, caller must have that project's access in addition to workspace access
- **Workspace-wide tasks:** visible only with explicit workspace access — not via single-project link alone in multi-project workspace
- Restricted workspaces invisible to non-members at SQL level
- Closed/read-only workspaces: SELECT allowed, mutations denied
- Project-close read-only applies per `tasks.project_id` match — not all tasks in linked workspace

---

## F. PROJECT / TASK ENGINE

### Canonical Task Fields

```
id, org_id
workspace_id (required), board_id, bucket_id (nullable until placed on board)
project_id (nullable — explicit PROJECT CONTEXT; authoritative attribution when non-null; see section C)
stage_definition_id (nullable — project stage context when applicable)
title, description (rich text allowed)
status: todo | in_progress | in_review | blocked | done | cancelled  ← CANONICAL (distinct from bucket)
priority: none | low | medium | high | urgent
start_date, due_date, completion_date
created_by_org_member_id nullable, created_by_employee_id nullable, created_by_system boolean DEFAULT false
  -- CHECK: exactly one of org_member | employee | system creator
owner_org_member_id OR owner_employee_id
estimated_effort_minutes (nullable)
actual_effort_minutes (computed SUM of linked time_entries.duration — operational only)
parent_task_id (nullable — subtasks)
sort_key (varchar — lexorank/fractional index for stable drag/drop ordering)
milestone_id (FK to project_milestones, nullable)
recurrence_rule_id (FK to task_recurrence_rules, nullable)
generated_from_occurrence_id (FK nullable — idempotent generated instance)
source: manual | template | automation | meeting_action | recurrence
approval_required (boolean)
-- NO approval_request_id on task row; history via multiple approval_requests(entity_type=task)
is_archived, archived_at, archived_by_org_member_id
created_at, updated_at
```

### Task Lifecycle

```
Draft (optional) → Todo → In Progress → In Review → Done
                              ↕                    ↕
                           Blocked             Cancelled
```

Completion is recorded with `completion_date` and `completed_by_org_member_id` OR `completed_by_employee_id`. No destructive delete — archived state only. Activity log records every state transition with canonical actor fields.

### Subtasks

- `parent_task_id` self-reference, max 2 levels enforced in domain
- Checklist items are within a task (lighter than subtasks)

### Dependencies

- `task_dependencies` table: `source_task_id`, `target_task_id`, `dependency_type` (finish_to_start | blocked_by)
- Cycle prevention enforced in domain (DFS before insert)
- No auto-cascade date reschedule (deterministic, not magical)
- Blocked status surface in UI and Today

### Recurrence (complete design — IN SCOPE)

Reuse `src/modules/service/recurrence/` infrastructure (`recurrenceOccurrences` idempotency pattern).

`task_recurrence_rules` fields:
- `rrule` (canonical RFC 5545 RRULE string)
- `timezone` (IANA, e.g. `Asia/Jerusalem`) — all occurrence boundaries computed in this TZ
- `starts_at`, `ends_at` (nullable), `max_occurrences` (nullable)
- Template task reference (master task definition)

`task_recurrence_occurrences`:
- **`UNIQUE (rule_id, occurrence_at)`** constraint at DB level — structural idempotency
- `status`: pending | generated | skipped | cancelled
- `generated_task_id` when materialized (UNIQUE per occurrence — no duplicate generation)
- DST: expand occurrences using timezone-aware library (same approach as service recurrence); document edge cases in domain tests

Generation job:
- Scheduled + on-demand safe regeneration (regenerates only pending/future; never duplicates generated rows)
- Skip/cancel updates occurrence row only; does not delete historical generated tasks
- Each generated task: `created_by_system = true`, `source = recurrence`, activity event `recurrence_generated` with `actor_system = true`
- **Do NOT** set `created_by_org_member_id` to template creator or rule author

### Task ↔ Planning Item Link

Optional: `planning_work_items.task_id` FK. When set, task status changes can optionally reflect on planning item progress. This is opt-in, not automatic.

---

## G. PORTFOLIO / MY WORK / WORKLOAD

### Portfolio View (`/portfolio`)

Server-side aggregated. Never fetches all tasks to browser.

**DB approach:** Materialized via a DB function / single JOIN query using task count aggregations per project. No N+1.

Columns (configurable via saved views):
- Project name, client, project manager, stage, status
- Open tasks count, Overdue tasks count, Blocked tasks count
- Next milestone (date + name), Last activity timestamp
- Health indicator (formula: overdue + blocked + inactivity score — transparent formula)
- Financial summary (if `financials.read` permission — reuse existing project financial data)

Filters: employee, client, stage, work_kind, status, label, overdue, stale (no activity in N days)

Performance: Single SQL query with access predicates. **KPI aggregation uses `tasks.project_id = portfolio project`** — workspace-wide tasks (`project_id NULL`) excluded from per-project rollups. Pagination 25/50/100. Counts scoped to accessible projects/tasks only.

### My Work (`/work`)

Views:
- Today (due_date = today)
- Overdue (due_date < today, not done)
- This Week
- Upcoming (next 14 days)
- Waiting / Blocked
- Assigned to Me
- Created by Me
- Assigned by Me
- Following (task_followers)
- Completed (last 30 days)

Single server query filtered by assignee identity AND **workspace access + task project-context access** (rules in section C-D). Never returns inaccessible tasks from shared multi-project workspaces.

Cross-project, cross-workspace, cross-board. Paginated. Sortable. Saved views supported (private + org-shared).

### Team Workload (`/workload`)

Shows per employee:
- Task count by status (open, overdue, due-this-week)
- Project count (from `employee_project_assignments`)
- Estimated effort if populated
- Reassignment action (bulk-assign permission required)

**No fabricated utilization %** unless estimated_effort_minutes is populated by team. Show task load, not fake percentages.

Reuse `employee_project_assignments` + `task_assignees` join. No new materialized table needed initially.

---

## H. BOARD / LIST / CALENDAR / TIMELINE

### Status vs Bucket (mandatory distinction)

| Concept | Meaning | Values |
|---|---|---|
| **Task Status** | Canonical workflow state | `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled` |
| **Bucket** | User-configurable board column | Org/board-defined names (Backlog, Review, Done column, etc.) |

**Rule:** Moving a task between buckets updates `bucket_id` + `sort_key`. Status changes when:
1. User explicitly changes status, OR
2. Target bucket has `task_buckets.status_on_enter` set (IN SCOPE — board settings UI)

`status_on_enter` nullable values: `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`
- `NULL` = bucket move does **NOT** alter task status
- Configured value = status applied on enter; activity log records bucket move **and** status change separately
- Configured per bucket in board settings; tested in Wave 4

### Board (Kanban)

- `workspaces` contain multiple `task_boards` (Design, Licensing, Construction, Handover…)
- Each project links to 0..N workspaces; **lazy default**: on first board access, create default workspace + default board if none exists (no silent backfill of all historical projects)
- `is_default` board per workspace; `is_archived` boards read-only, hidden from default nav
- Board ordering via `position` integer on `task_boards`
- Default buckets seeded from org template; fully configurable per board
- Drag & drop: update `bucket_id` + `sort_key` in single server action (status unchanged unless automation configured)
- Task cards show: title, assignee avatar(s), due date, priority badge, **status badge**, checklist progress, label chips, blocked indicator
- Quick add: inline title entry per bucket
- Filters: assignee, label, priority, due date range, overdue, blocked, status
- Per-board group by: bucket (default), assignee, label, priority
- Permissions: `tasks.read` scoped to workspace/project; `tasks.manage_all` for cross-team boards

### Global board (`/work/board`)

Project boards have **different bucket IDs** — global board cannot assume shared buckets.

Default group-by: **canonical task status** (recommended). Alternatives: assignee, priority, label.

Project-specific buckets remain local to their workspace/board only.

### Task ordering

Use **lexorank** (`sort_key` varchar) — same stable fractional-index pattern used elsewhere in ProjectFlow for drag/drop lists. Rebalance bucket when keys exhaust (domain helper). Do **not** use `float` position (degrades after repeated moves).

### List View

- High-density table: title, assignee, status, priority, due date, labels, project
- Sort: due date, priority, creation date, last update, title
- Column selector: show/hide columns
- Multi-select + bulk actions: assign, change status, change label, archive
- Saved views (reuse `savedListViews` infrastructure, add `tasks` key)
- **Saved view scope:** `private` (default, per-user) and `organization` (shared, visible to all org members with list permission) — extend schema now
- Server-side filtering + pagination

### Calendar (extended)

Extend `src/modules/calendar/data/source-dates.repository.ts`:
- Add `task` kind to projected items (due_date, if assigned to user or all tasks in project)
- Add `milestone` kind (already partially exists)
- Month + agenda views

**External calendar sync (Google/Outlook): EXCLUDED** — native calendar + task/milestone projections only; external sync requires OAuth provider work outside this program scope.

### Timeline / Gantt (extended, not duplicated)

Extend existing `planning_work_items` write UI:
- Add server actions for create / update / archive planning work items (the domain + repository already exists; only UI write layer is missing)
- Link tasks to planning items optionally
- Task milestones surface on timeline
- Dependencies visualized (already in domain, extend Gantt chart rendering)

**Do NOT build a second Gantt engine.**

---

## I. TEMPLATES / CUSTOM FIELDS / STAGES / LABELS

### Organization Profile Type

New field on `organizations`: `org_profile_type` enum:
`contractor | subcontractor | architect | engineer | consultant | project_manager | developer | supervisor | other`

Controls:
- Default stage set applied at org creation
- Default bucket names
- Default dashboard sections
- Default nav order
- Default quick access shortcuts
- Recommended project template
- Default terminology overrides (stored in `terminology_config` JSONB)

Does NOT create separate DB engines. All orgs share the same tables.

### Terminology Configuration

`terminology_config` JSONB on `organizations`:
```json
{
  "project": "Project",
  "task": "Task",
  "board": "Board",
  "stage": "Stage",
  "bucket": "Column"
}
```
UI labels read from terminology config with fallback to system defaults. No DB schema per term — config key map only. Internal canonical names remain unchanged in code.

### Project Stages

`project_stage_definitions` (org-scoped):
- `name`, `color`, `position`, `is_archived`, `is_default`
- Optional `work_kind` filter (only show for project / job / work_order)
- Not hardcoded. Seeded from org profile at org creation.

**Stage history (immutable):** `project_stage_transitions` records every change. **Initial stage** creates first row: `from_stage_id = NULL`, `to_stage_id = initial stage`. Current stage = `ORDER BY transitioned_at DESC, id DESC` (deterministic tie-break). Index: `(project_id, transitioned_at DESC, id DESC)`. UI shows timeline. No hidden current-stage source table.

No `project_stage_assignments` — forbidden.

### Labels / Tags

`task_labels` (org-scoped): `name`, `color`, `is_archived`
Applied via `task_label_assignments`.
Filter in board, list, portfolio, My Work.

### Custom Fields (extended)

Add `task` to `custom_field_definitions.entity_type` enum. All existing CF infrastructure (validation, UI panel, search indexing) reused with zero new code for the engine itself.

### Templates

**Project Template** (`project_templates` + `project_template_stages` + `project_template_tasks`):
- Name, description, org_profile_type (which org types see this as default)
- Stages with position
- Tasks per stage with: title, description, default priority, checklist items, label hints, due_date_offset_days (relative to project start or milestone)
- Milestones with offset
- Default board bucket configuration

**Task Template** (`task_templates` + `task_template_items`):
- Reusable single-task definition (checklist, labels, description, priority)
- Available in quick-add task form

**Applying a template**: server action `applyProjectTemplate` — extends existing `apply-project-template.ts` to also create tasks and stages. Existing structure (WP/phase) creation reused.

### Sample Default Templates (seeded at org creation per profile type)

- **Architect**: Stages: Concept → Preliminary → Permit → Detailed → Tender → Construction → Handover. Buckets: Backlog / Active / Review / Done.
- **Engineering Consultant**: Stages: Intake → Planning → Coordination → Submission → Review → Approved.
- **PMO**: Stages: Initiation → Planning → Execution → Monitoring → Closure.
- **Developer**: Stages: Feasibility → Design → Licensing → Tender → Construction → Sales → Handover.
- **Main Contractor**: Stages: Tender → Awarded → Mobilization → Execution → Testing → Handover → Warranty.
- **Subcontractor**: Stages: Quoted → Awarded → Procurement → Execution → Inspection → Complete.

### Existing organization adoption (IN SCOPE)

Idempotent flow at `/settings/adoption`:

1. Owner selects `org_profile_type`
2. System previews defaults (stages, workspaces/boards, templates, module visibility, terminology)
3. Owner confirms Apply
4. Seeding runs with **insert-if-missing** only — never overwrites customized existing config

Seedable: stage definitions, default workspace/board templates, project templates, task templates, `module_config`, `terminology_config`.

**Existing projects strategy: lazy default workspace/board creation** — when user first opens Boards tab or applies template, create default workspace + board if absent. No bulk backfill migration of all historical projects.

Adoption action logged in audit; re-runnable safely.

### Project / workspace closeout (IN SCOPE)

**Project close** (`projects.closed_at`, `projects.is_read_only = true`):

Preserves: tasks, comments, activity, decisions, approvals, milestones, documents, time links, boards, workspace links. No cascade delete.

Per-task behavior (by `tasks.project_id`):

| Task context | On Project A close |
|---|---|
| `project_id = Project A` | Read-only (no edit/delete; read + export OK) |
| `project_id = Project B` (shared workspace) | Remains editable if Project B open |
| `project_id = NULL` (workspace-wide) | **Not** frozen by Project A close — governed by workspace state |

Shared workspace: **remains active**; does **NOT** become read-only when one linked project closes.

Optional: `project_workspace_links.link_closed_at` when Project A closes — does not read-only entire workspace.

New tasks with `project_id = Project A` blocked after close. Tasks for other contexts in same workspace still creatable if permitted.

**Workspace close** (`workspaces.closed_at`, `workspaces.is_read_only = true`):

- Explicit action only — read-only for **all** tasks in workspace regardless of `project_id`
- Mutations denied; read preserved

No automatic workspace read-only when last linked project closes (unless future adoption config — default is explicit workspace close only).

---

## J. COMMENTS / ACTIVITY / APPROVALS

### Comments (new)

`task_comments` table:
```
id, org_id, task_id
author_org_member_id nullable, author_employee_id nullable  -- CHECK exactly one
body (text)
is_edited, edited_at
is_deleted (soft), deleted_at
created_at
```

- Employee App: always sets `author_employee_id` from `employee_app_accounts.employee_id` — never fabricates org_membership
- Mention support: `@org_member_id` parsed from body, triggers notification
- **Comment threading: EXCLUDED** — flat chronological comments only; threading adds UX/schema complexity without MVP requirement
- Attachments: extend `document_links` with `owner_type = 'task_comment'`
- Permission: `tasks.comment`
- RLS: org-scoped + task read required

### Task Activity Log

`task_activity` table (append-only):
```
id, org_id, task_id
actor_org_member_id nullable, actor_employee_id nullable, actor_system boolean DEFAULT false
  -- CHECK: exactly one of org_member | employee | system
event_type (enum: created|status_changed|bucket_changed|assigned|due_date_changed|
            priority_changed|comment_added|attachment_added|
            checklist_completed|approval_result|dependency_added|
            dependency_removed|completed|reopened|archived|label_added|
            recurrence_generated|automation_changed|system_generated)
payload JSONB (before/after values)
created_at
```

- Employee App human actions: `actor_employee_id`
- Recurrence/automation/scheduled: `actor_system = true` with matching event type — never impersonate human

- Never update or delete
- Displayed in task detail sidebar as activity feed
- Complement (not duplicate) existing `audit_events`

### Approvals (reused + extended)

Extend `approval_requests.entity_type` to include `task`.

When `task.approval_required = true`:
- Task moves to `in_review` status
- New `approval_request` created (reuse existing `submit-and-gate.ts`) with `entity_type = task`, `entity_id = task.id`
- Approver sees item in `/approvals` inbox (existing route)
- On approve → task moves to `done`; on reject → task returns to `in_progress`
- Activity log records decision

**Multiple approval cycles (history-preserving):**
- Task may have Approval Request #1 (rejected) → revision → Approval Request #2 (approved)
- **No** `task.approval_request_id` column — query `approval_requests WHERE entity_type='task' AND entity_id=? ORDER BY created_at`
- All cycles retained in approvals module + task activity feed

No new approval tables. Unified `/approvals` inbox extended.

### Meetings + Decisions (IN SCOPE — Agent I)

```
Meeting
  ├── meeting_attendees (structured: org_member | employee | contact | display_name)
  ├── notes (rich text)
  ├── meeting_decisions (canonical — NOT tasks)
  └── meeting_action_items → optional task_id link/create
```

- **Decision ≠ Task** — decisions are recorded separately; action items may spawn tasks
- Do not rely on `attendees_text` alone — structured attendees required with optional free-text fallback row
- Permissions: `meetings.read`, `meetings.manage`
- Routes: `/meetings`, `/meetings/[meetingId]`

---

## K. DOCUMENTS / STORAGE

No new infrastructure needed.

- Extend `document_links.owner_type` enum to include `task` and `task_comment`
- Task detail panel includes `DocumentAttachments` component (reuse existing)
- Files already in project document library can be linked to tasks via existing `document_links`
- External storage (OneDrive/Drive/Dropbox/Box) attachment flow unchanged

---

## L. TODAY / NOTIFICATIONS / AUTOMATIONS

### Today / Command Center (extended)

New source types added to `src/modules/command-center/domain/types.ts`:

```
task_overdue              — task past due date, assigned to current user
task_due_today            — task due today
task_blocked_waiting      — task blocked for > N days
task_approval_requested   — task needs approval from current user
task_unassigned           — project task with no assignee (managers)
milestone_approaching     — milestone due in 7 days
project_stale             — no task activity in > 14 days
recurring_task_generated  — new recurring task created
```

These are computed (not stored) — same pattern as all existing source types. Added to `collect-sources.ts`.

**Access rule:** Today task sources apply workspace access **+ task project-context access** (same as My Work) — no leaking inaccessible task titles/counts from shared workspaces.

### Notifications (extended)

New notification events in `src/modules/notifications/domain/types.ts`:
```
task_assigned_to_you
task_comment_mention
task_due_soon
task_overdue
task_approval_requested
task_approval_decided
task_dependency_resolved
milestone_approaching
```

Deduplication: use existing `notifications.dedupe` infrastructure. No duplicate alerts per task per day.

Channels: in-app only (existing). **Email/push notifications: EXCLUDED** — stub infrastructure exists; full channel delivery outside this program scope.

### Automations (extended)

Extend `automation_rules` trigger and action types:

**Triggers:**
```
task.status_changed_to
task.overdue
task.assigned_to
task.created_from_template
task.approval_rejected
task.dependency_resolved
milestone.approaching_days
project.created
```

**Actions:**
```
notify_user
create_task
change_task_status
assign_task
add_task_label
create_approval
```

Bounded, deterministic rules. No Zapier-style open connectors. Reuse existing `run-rules.ts` executor pattern.

**System actor for automations:**
- Actions that create/change tasks without direct human command: `created_by_system = true` / `actor_system = true`
- Activity event: `automation_changed` or `system_generated` as appropriate
- Rule author is **NOT** recorded as task creator for automated side effects

---

## M. EMPLOYEE APP

**Preserve existing punch-list / safety / field items — no regression.**

`/employee/tasks` uses **two tabs** (or equivalent clear entity distinction):

| Tab | Entity | Notes |
|---|---|---|
| **PM Tasks** | New canonical `tasks` | Permission-gated PM work |
| **Field / Punch** | Existing punch-list items | Unchanged capability |

Do **NOT** replace punch list with PM tasks.

PM Tasks capabilities (if `tasks.read` granted with `assigned_tasks` or `assigned_projects` scope):
- Task list + detail: title, description, checklist, comments, attachments
- Update status (if `tasks.update` scope = `assigned_tasks`) — activity uses `actor_employee_id`
- Complete checklist items, add comment (`author_employee_id`), attach photo, mark complete
- Access obeys workspace + project scope in RLS — not permission grant alone

Employee must NOT see:
- Financial data through task context (task_id ≠ billing access)
- Other employees' tasks unless scope allows
- Management views (portfolio, workload)

Employee app presets extended:
- `field_worker` preset: tasks.read (`assigned_tasks`), tasks.update (`assigned_tasks`)
- `foreman` preset: tasks.read (`assigned_projects`), tasks.assign (`assigned_projects`)
- `project_manager` preset: tasks.manage_all (`workspace` or `assigned_projects`)

---

## N. FINANCIAL INTEGRATION BOUNDARIES

### What tasks can link to (read-only references)

- `project_id` — task belongs to project (financial context available to those with `financials.read`)
- `milestone_id` — task linked to billing milestone (milestone defines billing trigger, task does not)
- `change_request_id` — **EXCLUDED** in this program (change-order task spawn is separate workflow)

### What tasks must NOT do

- Task completion must NOT automatically create billing records
- Task status change must NOT modify financial truth
- Task "Approve PO" must route through existing PO approval command — task is a reminder/workflow signal, not the financial gate
- No `amount` or `cost` fields on task entity itself

### Financial data in task context

- Project financials visible in project workspace sidebar to users with `financials.read`
- Task detail does not embed financial data

### Explicit: existing financial calculations unchanged

All financial engines (`src/modules/financials/`, billing, AP, payroll, etc.) are untouched by this program. Zero modifications to financial truth.

### Time tracking ↔ tasks (IN SCOPE)

- Extend `time_entries` with optional nullable `task_id` FK
- `tasks.actual_effort_minutes` = SUM(`time_entries.duration`) where `task_id` matches — **operational metric only**
- Payroll/labor costing continues using existing canonical labor engine paths — task link does not alter pay calculations or create double counting
- UI: task detail shows Estimated Effort vs Actual Time side-by-side
- Time entry form: optional task picker (scoped to user's project tasks)

---

## O. REPORTING

### New operational reports (extend existing report engine)

Add to `src/modules/reports/domain/kinds.ts`:
- `project_task_status` — task breakdown by status per project
- `overdue_tasks_org` — org-wide overdue tasks by project + assignee
- `milestone_status` — milestone health across portfolio
- `team_workload` — tasks per employee
- `portfolio_status` — project portfolio health grid
- `stage_distribution` — projects by stage
- `stale_projects` — no activity in N days
- `approval_queue_status` — pending approvals by type

Reuse existing `reports/` module infrastructure and branded print shell.

---

## P. MOBILE / RTL / I18N

### Mobile

All new views must follow existing responsive patterns:
- Board on mobile: single-column card stack (no drag-drop; swipe actions for status change or bucket move as separate explicit actions)
- My Work: mobile-first card list
- Portfolio: scrollable summary cards
- Task detail: full-screen sheet on mobile
- Employee tasks: already mobile-first

Reuse `ResponsiveTable` pattern, PWA shell, `MobileNav`, safe-area padding.

### RTL

- All new components use logical CSS (`start/end`, `border-e`, `me-*`)
- No hardcoded `left/right` in new components
- `LtrIsland` for task IDs, dates, numbers

### i18n

New locale namespaces (all 4 locales: he-IL, en, ar, ru):
- `tasks.json` — task entity labels
- `board.json` — board/bucket UI
- `portfolio.json` — portfolio view
- `workload.json` — workload labels
- `stages.json` — stage management
- `meetings.json` — meeting records
- `taskTemplates.json` — template management

All org-defined labels (stage names, bucket names, task labels) are user content — no automatic translation required.

---

## Q. PERFORMANCE / INDEXING

### Critical indexes (new tables)

```sql
-- tasks
CREATE INDEX tasks_org_workspace ON tasks(org_id, workspace_id);
CREATE INDEX tasks_project_context ON tasks(project_id, status, due_date) WHERE project_id IS NOT NULL;
CREATE INDEX tasks_org_project ON tasks(org_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX tasks_due_date ON tasks(org_id, due_date) WHERE status NOT IN ('done','cancelled');
CREATE INDEX tasks_bucket ON tasks(bucket_id, sort_key);
CREATE INDEX tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX tasks_created_by ON tasks(org_id, created_by_org_member_id);

-- assignees (My Work)
CREATE INDEX task_assignees_org_member ON task_assignees(org_member_id, task_id);
CREATE INDEX task_assignees_employee ON task_assignees(employee_id, task_id);

-- portfolio rollup (with access joins)
CREATE INDEX tasks_portfolio_rollup ON tasks(org_id, workspace_id, status, due_date);

-- workspace access
CREATE INDEX workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX workspace_members_org_member ON workspace_members(org_member_id, workspace_id);
CREATE UNIQUE INDEX project_workspace_links_uq ON project_workspace_links(workspace_id, project_id);
CREATE INDEX project_workspace_links_project ON project_workspace_links(project_id);
CREATE INDEX project_workspace_links_workspace ON project_workspace_links(workspace_id);

-- stages (current lookup)
CREATE INDEX stage_transitions_current ON project_stage_transitions(project_id, transitioned_at DESC, id DESC);

-- recurrence idempotency (structural UNIQUE also required)
CREATE UNIQUE INDEX task_recurrence_occurrences_uq ON task_recurrence_occurrences(rule_id, occurrence_at);

-- approvals history lookup
CREATE INDEX approval_requests_task ON approval_requests(entity_type, entity_id, created_at DESC)
  WHERE entity_type = 'task';

-- comments/activity
CREATE INDEX task_comments_task ON task_comments(task_id, created_at);
CREATE INDEX task_activity_task ON task_activity(task_id, created_at);

-- workspaces / boards
CREATE INDEX workspaces_org ON workspaces(org_id, workspace_type, workspace_visibility);
CREATE INDEX task_boards_workspace ON task_boards(workspace_id, position);
CREATE INDEX org_team_members_team ON org_team_members(org_team_id);
```

### Pagination

- All list views: cursor-based or offset pagination (max 50 per page)
- Portfolio: paginated (25/50/100 projects per page)
- My Work: paginated (50 tasks per page)
- Board: loads tasks per bucket lazily if > 100 tasks per bucket (virtual scroll)

### Server-side filtering

All filtering done in SQL. No fetch-all-then-filter pattern. `savedListViews` stores URL params; server re-applies them on query.

### Materialized views — CONDITIONAL INFRA OPTIMIZATION

Portfolio rollup via single aggregated SQL query in implementation. **`project_task_summary` materialized view** is an architecture fallback only if runtime metrics at 1000+ projects prove the live query insufficient — not deferred product scope.

### Scale verification strategy (IN SCOPE)

Target: 1000+ projects, 100,000+ tasks per org architecture.

Verification without production-scale data:
- Dev/staging seed script: 1 org, 1000 projects, 100k tasks (synthetic, not deployed to production)
- `EXPLAIN ANALYZE` on portfolio rollup, My Work, global board group-by-status queries
- Assert p95 query time thresholds documented in Wave 4 QA (e.g. portfolio page < 2s at 1000 projects)
- Board bucket lazy-load tested at 500+ tasks per bucket

---

## R. MIGRATIONS

### Wave 0 migration preflight (Lead — automatic, no Owner manual confirm)

Before writing N+0, Lead MUST:

1. Inspect `drizzle/migrations/` directory (all SQL files, numbering)
2. Inspect migration journal / DB migration state via existing project-safe mechanism (e.g. drizzle journal, `scripts/` diagnostics, CI migration check)
3. Determine exact highest applied migration number
4. Detect any missing already-existing migrations (including employee-app migrations) and resolve ordering **before** authoring new SQL
5. Assign N = highest_applied + 1

**Do not ask Owner to manually confirm migration 0088 or any other applied state.**

Only unavoidable external checkpoint: production DB credentials unavailable at apply time. If credentials exist, Lead applies migrations as part of continuous release.

### Migration plan (17 migrations: N+0 through N+16)

| # | Content | Notes |
|---|---|---|
| N+0 | `org_profile_type` enum + columns on organizations (`terminology_config`, `module_config` JSONB) | Backward-compatible; nullable |
| N+1 | `org_teams`, `org_team_members`, `workspaces`, `workspace_members`, `project_workspace_links` | UNIQUE(workspace_id, project_id); no project_id on workspaces |
| N+2 | `project_stage_definitions` + `project_stage_transitions` | Initial transition from NULL; current = latest row |
| N+3 | `task_boards` + `task_buckets` (incl. `status_on_enter`) | Multiple boards per workspace |
| N+4 | Core `tasks` table + `task_assignees` + `task_checklist_items` | Creator CHECK (org_member \| employee \| system); project_id context validation |
| N+5 | `task_dependencies` + `task_followers` | Relations |
| N+6 | `task_comments` + `task_activity` | Activity actor CHECK (org_member \| employee \| system); system event types |
| N+7 | `task_recurrence_rules` + `task_recurrence_occurrences` | RRULE + **UNIQUE(rule_id, occurrence_at)** |
| N+8 | `task_labels` + `task_label_assignments` | Labels |
| N+9 | `project_templates` + stages + tasks + `task_templates` + items | Templates |
| N+10 | `meeting_records` + `meeting_attendees` + `meeting_decisions` + `meeting_action_items` | Full meeting model |
| N+11 | Extend enums + `saved_list_views.scope` + org-shared owner column | Additive |
| N+12 | `time_entries.task_id` optional FK | Operational link only |
| N+13 | Extend `automation_rules` trigger/action enums | Additive |
| N+14 | New permission keys + RLS installs | Includes `operations.read`, `modules.manage` |
| N+15 | `planning_work_items.task_id` FK | Nullable, no backfill |
| N+16 | `projects.closed_at` / read-only closeout columns | Archive semantics |

Each migration includes:
- Table creation with proper FKs + `org_id` for RLS
- `app.install_permissioned_rls()` calls following existing pattern
- All required indexes
- No modification of existing financial tables

Migration ownership: **Lead sole author** of all migration SQL (N+0…N+16). Agents submit schema requirements; Lead integrates. No two agents write migration files.

---

## S. COMPLETE EXECUTION ORDER

### Wave 0 — Foundation (must complete before UI work)
1. **Automatic migration preflight** (section R — no Owner manual confirm)
2. Write + review migrations N+0 through N+6 (teams, workspaces, access, core entities)
3. Extend permission catalog with canonical scopes
4. Publish shared access contracts (workspace visibility, RLS predicates, actor fields)
5. Define org profile + module seeding + adoption logic
6. Extend existing template application to handle stages + tasks + default workspaces

### Wave 1 — Core modules (parallel, after Wave 0)
- Agent A: Task + workspace domain + application layer (`src/modules/tasks/`, `src/modules/workspaces/`)
- Agent B: Board/bucket application + basic board UI + workspace routes
- Agent C: My Work application + list UI
- Agent D: Stage definitions + transition history UI
- Agent E: Comments + activity + multi-cycle approval integration
- Agent F: Labels + custom fields + template foundations

### Wave 2 — Extended views (parallel, after Wave 1)
- Agent B(cont): Full board with drag-drop, global board (status group-by), filters
- Agent C(cont): Portfolio view + workload view
- Agent D(cont): Calendar extension + timeline write UI
- Agent G: Today extension + notifications extension + automations
- Agent H: Employee app PM Tasks tab + punch list preservation
- Agent I: Operations Dashboard + meetings/decisions + adoption seeding + search/reports

### Wave 3 — Polish + Integration
- Navigation updates (Lead + all agents merged; module_config gating)
- i18n for all new namespaces (all 4 locales)
- Mobile responsiveness sweep
- Saved views (private + org-shared) for tasks + portfolio + operations
- Settings pages (stages, labels, templates, org profile, modules, adoption)

### Wave 4 — QA + Release (continuous / one-click after approval)

After Owner clicks **Build / Implement**, Lead owns complete execution until production is healthy:

```
PLAN APPROVED → Build clicked
  → Wave 0 preflight + migrations/schema (Lead)
  → parallel agents + integration
  → focused tests + scale seed/EXPLAIN
  → migration apply (Lead if credentials available)
  → commit → push main → CI/build → Vercel Production → production smoke
  → fix implementation/release failures → rerun CI/deploy if needed
  → COMPLETE
```

**NO further approval for:** waves, migrations (if creds available), commit, push, CI, deploy, smoke, or fixing release failures.

**Do NOT stop** after commit, after push, or after failed CI waiting for Owner.

**ONLY checkpoint:** production DB migration credentials genuinely unavailable.

---

## T. PARALLEL AUTO-AGENT PLAN

### Agent division (9 workstreams + Lead)

**AGENT A — Task + Workspace Core + Access Domain**
- Owns: `src/modules/tasks/` + `src/modules/workspaces/` (domain, application, data, validation)
- Delivers: workspace CRUD, access checks (incl. project-context), board CRUD, human + system actor enforcement, project_id context validation, assignee resolution, task CRUD, lazy default workspace creation
- Does NOT touch: migration SQL, UI shell

**AGENT B — Board / List / My Work UI**
- Owns: `src/app/[locale]/(app)/work/`, `workspaces/`, `projects/[projectId]/boards/`, board UI components
- Depends on: Agent A's application layer contracts
- Delivers: Per-workspace boards (multiple), global board (status group-by), bucket UI, My Work page, task list view, task detail sheet/drawer

**AGENT C — Portfolio / Workload (access-safe aggregation)**
- Owns: `src/app/[locale]/(app)/portfolio/` (new), `src/app/[locale]/(app)/workload/` (new)
- Delivers: access-scoped aggregation queries (counts never include inaccessible data), portfolio UI, workload UI
- Does NOT touch: financial calculations

**AGENT D — Calendar / Timeline / Milestones / Dependencies**
- Owns: extend `src/modules/calendar/data/source-dates.repository.ts`, extend `src/modules/planning/` write UI, milestone extensions
- Delivers: task due dates in calendar, timeline write actions, dependency visualization extension

**AGENT E — Comments / Activity / Approvals**
- Owns: `src/modules/tasks/ui/task-comments.tsx`, `task-activity.tsx`, approval integration in task detail
- Delivers: comment CRUD + mentions, activity feed, approval gate on task

**AGENT F — Templates / Stages / Labels / Custom Fields / Settings UI**
- Owns: `src/modules/tenancy/application/` (extend templates), `settings/stages/`, `settings/labels/`, `settings/task-templates/`, `settings/project-templates/`, `settings/org-profile/`, `settings/modules/`
- Delivers: stage CRUD UI, label management, task/project template management, org profile type UI, terminology settings, module enablement UI

**AGENT I — Operations / Meetings / Adoption / Search / Reports (access-safe)**
- Owns: `src/app/[locale]/(app)/operations/`, `src/modules/meetings/` (new), `settings/adoption/`, global search task kind, report kinds additions
- Delivers: Operations Dashboard (access-scoped counts), meetings/decisions stack, adoption seeding, **task search with workspace access filter**, operational reports
- Does NOT touch: financial calculations, migration SQL

**AGENT G — Today / Notifications / Automations**
- Owns: extend `src/modules/command-center/data/collect-sources.ts`, extend `src/modules/notifications/`, extend `src/modules/automations/`
- Delivers: all new task source types in Today, new notification event types, new automation triggers/actions

**AGENT H — Employee App / Permissions / Employee Actor**
- Owns: extend `src/app/[locale]/employee/` task views, extend `src/modules/employee-app/`, permission scopes + presets
- Delivers: PM Tasks tab + punch/safety tab, `author_employee_id` / `actor_employee_id` flows, canonical scope strings end-to-end

**LEAD — Integration / Schema / Migration / Release**
- Owns: all migration SQL (N+0…N+16), schema integration, **canonical access contracts**, navigation, i18n (4 locales), agent integration, preflight, **one-click continuous release to production health**
- Agents submit schema/API requirements; Lead merges into migrations and shared contracts

### Shared contracts (defined by Lead before Wave 1)

- Task module public API (`src/modules/tasks/index.ts`) — typed and locked before agents start
- New route paths — agreed before agents start
- Migration numbers — Lead assigns, agents do not self-number
- Permission key strings — Lead defines, agents import from catalog

### Conflict prevention

- Each agent owns distinct files/modules (no shared file edits without Lead coordination)
- Schema file is owned by Lead (agents submit schema additions to Lead)
- Navigation file owned by Lead
- i18n files owned by Lead (agents provide translation strings in a handoff format)

---

## U. TEST / VALIDATION PLAN

### Unit tests (new)
- Task domain: lifecycle, status transitions, dependency cycle detection, recurrence rule generation
- System actor: recurrence/automation create with `created_by_system`; activity with `actor_system`; CHECK rejects multi-identity
- Shared workspace: project_id validation against links; access matrix for multi-project workspace
- Permission: task scopes, employee app grant checks
- Template: apply project template generates expected tasks + stages
- Portfolio: aggregation query correctness

### Integration tests (new)
- Task CRUD with RLS isolation
- Task assignment + notification emission
- Task approval gate (submit → approve → done, submit → reject → in_progress)
- Multi-cycle approval (reject → revise → re-submit → approve; all history retained)
- Recurrence idempotency (no duplicate generated tasks for same occurrence)
- Recurrence creates task with `created_by_system = true`; activity `recurrence_generated` + `actor_system`
- Automation writes activity with `actor_system`; never impersonates org_member/employee
- Creator/actor CHECK rejects multiple identity types simultaneously
- Shared workspace: user with Project A only cannot see Project B tasks or restricted workspace-wide tasks
- Portfolio counts workspace-wide tasks only in Operations/Workspace — not duplicated in A+B project KPIs
- Project A close freezes A-context tasks only; B tasks editable; workspace-wide tasks follow workspace state
- Workspace org-internal task without project
- Scale seed script: 1000 projects / 100k tasks query benchmarks
- Recurring task generation
- My Work query across projects
- Portfolio rollup correctness
- Calendar integration (task due dates appear)

### UI tests (extend existing)
- Board drag-drop (bucket change reflected in DB; status unchanged when status_on_enter NULL)
- Bucket status_on_enter applies configured status + dual activity events
- Workspace access: restricted workspace invisible to non-member in list/search/My Work
- Task detail sheet (open, edit, comment, close)
- My Work view filter

### Non-regression (existing)
- All existing financial calculation tests pass unchanged
- Project CRUD unchanged
- Existing Gantt rendering unchanged
- Employee app auth unchanged
- All existing permission tests pass

### No heavy QA bureaucracy

No E2E coverage for every click. Focus on: task lifecycle, permissions, templates, financial non-regression.

---

## V. FINAL ACCEPTANCE CRITERIA

### V3.1 additions (final architecture fixes)

- [ ] System actor: `created_by_system` / `actor_system` for recurrence + automation — no human impersonation
- [ ] Task creator CHECK: exactly one of org_member | employee | system
- [ ] Activity actor CHECK: exactly one of org_member | employee | system
- [ ] Activity events: `recurrence_generated`, `automation_changed`, `system_generated`
- [ ] `tasks.project_id` = authoritative project context (not denormalized cache)
- [ ] Multi-project workspace: explicit project selection OR workspace-wide (`project_id NULL`) required at create
- [ ] `project_id` non-null validated against `project_workspace_links(workspace_id, project_id)`
- [ ] UNIQUE `project_workspace_links(workspace_id, project_id)`
- [ ] Shared workspace access: workspace access + project-context access in SQL for all surfaces
- [ ] Workspace-wide tasks not visible via single-project access alone
- [ ] Portfolio KPIs: only `tasks.project_id = project` counted
- [ ] Project close: A-context tasks read-only; B-context active; workspace-wide not frozen by A close
- [ ] Search/My Work/Today/Operations/Workload: zero cross-project leakage in shared workspace

### V3 additions (consistency patch)

- [ ] `project_workspace_links` is sole project↔workspace source of truth (`workspaces` has NO `project_id`)
- [ ] Shared workspace: closing one project does NOT read-only the whole workspace
- [ ] Restricted org-internal workspace invisible to non-members (RLS)
- [ ] Org-wide workspace visible per permission; team workspace per org_team + members
- [ ] My Work never returns inaccessible tasks
- [ ] Portfolio/Operations/Workload/Today counts never leak inaccessible data
- [ ] Global search never returns task hits for inaccessible workspaces
- [ ] Employee App obeys task permission + workspace/project scope
- [ ] Closed/read-only workspace: readable, not mutable
- [ ] Non-project task assignees from workspace membership (not employee_project_assignments)
- [ ] `task_buckets.status_on_enter` configurable; NULL = no status change on bucket move
- [ ] Actor fields normalized (`author_employee_id`, `actor_employee_id` in Employee App)
- [ ] Permission scopes use canonical list only (no `self_assigned`)
- [ ] `org_teams` + `org_team_members` exist (no phantom team_id FK)
- [ ] Recurrence UNIQUE(rule_id, occurrence_at) enforced at DB
- [ ] Stage current = latest transition ORDER BY transitioned_at DESC, id DESC; initial from NULL

### V2 additions (architecture amendments)

- [ ] Org-internal workspace works without fake project/client
- [ ] Project supports multiple boards/plans with default + archive
- [ ] Module enablement toggles navigation without deleting data
- [ ] Actor model: creator/owner/assignee use org_member_id OR employee_id OR system (creator/activity)
- [ ] Employees assignable without Employee App login (where workforce RLS allows)
- [ ] Stage transition history immutable; current stage = latest transition
- [ ] Meetings: structured attendees, decisions (≠ tasks), action items link/create tasks
- [ ] Recurrence: timezone + RRULE + idempotent occurrences; no duplicate generated tasks; DST tested
- [ ] Task approval: multiple cycles retained; no single `approval_request_id` on task
- [ ] Time entries optionally link to tasks; Estimated vs Actual shown; payroll truth unchanged
- [ ] Employee App: PM Tasks tab + punch/safety tab both functional
- [ ] Operations Dashboard at `/operations` separate from financial dashboard
- [ ] Existing org adoption: preview → apply, insert-if-missing, no silent overwrite
- [ ] Global board groups by canonical status (not cross-project bucket IDs)
- [ ] Bucket move does not change status unless board automation configured
- [ ] Project closeout: per `tasks.project_id`; shared workspace active; workspace-wide tasks not auto-frozen; no destructive cleanup
- [ ] Architecture verified at 1000 projects / 100k tasks via seed + EXPLAIN ANALYZE (not production data)

### Core criteria (V1 + V2)

- [ ] Organization can set `org_profile_type` and get appropriate default stages + template
- [ ] Organization can create custom stage workflow (add/rename/reorder/archive stages)
- [ ] Project created from template generates stages + tasks + default workspace/boards
- [ ] Task board has configurable buckets (not hardcoded); status distinct from bucket
- [ ] Task can be assigned to multiple assignees (org members and/or employees)
- [ ] My Work aggregates tasks across all workspaces/projects/boards for current user
- [ ] My Work views work: Today, Overdue, This Week, Upcoming, Blocked
- [ ] Portfolio supports **1000+ projects** with server-side aggregation (no N+1); p95 < 2s in scale test
- [ ] Task queries support **100k+ tasks** with indexed pagination; no client-side filter at scale
- [ ] Portfolio filters work server-side: by stage, employee, client, status, overdue, stale
- [ ] Team Workload shows tasks per employee without fabricated percentages
- [ ] Task dependencies block appropriately (blocked status, Today alert)
- [ ] Cycle detection prevents circular dependencies
- [ ] Recurring tasks generate safely (template → generated instance)
- [ ] Task comments preserved with mentions, author, timestamp
- [ ] Task activity log records all state changes (append-only, immutable)
- [ ] Task approval gate: request → decide → status update → activity log
- [ ] External storage attachments work on tasks (OneDrive, Drive, Dropbox, Box)
- [ ] Employee with `tasks.read (assigned_projects)` sees only their project tasks
- [ ] Employee with no task grants sees no task data
- [ ] Today surfaces: task_overdue, task_due_today, task_blocked_waiting, milestone_approaching
- [ ] Notification emitted on: task_assigned_to_you, comment_mention, task_due_soon, approval_needed
- [ ] Automation: WHEN task status → notify; WHEN milestone approaching → alert
- [ ] Calendar shows task due dates + milestones
- [ ] Timeline (Gantt) supports user-facing create/edit of planning items
- [ ] All 4 locales compile (he-IL, en, ar, ru) with no missing keys
- [ ] RTL layout correct in Hebrew and Arabic for all new views
- [ ] Mobile: My Work, task detail, board (card stack), comments, checklist usable on phone
- [ ] Existing financial calculations produce identical results (regression suite green)
- [ ] Custom fields work on tasks (add org-defined custom field, set value, search)
- [ ] Saved views work for tasks list and portfolio (private per-user AND organization-shared scope)
- [ ] Global search returns tasks **only when workspace + project-context access passes** (no shared-workspace leakage)
- [ ] Settings: stages, labels, task templates, project templates, org profile type — all manageable
- [ ] Reports: project_task_status, overdue_tasks_org, milestone_status, team_workload generated

---

## W. RISKS / CONFLICTS

| Risk | Mitigation |
|---|---|
| Current highest migration number uncertain | Wave 0 automatic preflight (section R) — Lead resolves before any new SQL |
| Missing historical migrations detected in preflight | Lead resolves ordering/applies blockers before Wave 1 — no Owner manual confirm |
| `planning_work_items` write UI requires careful extension (existing domain has eligibility guards for `work_kind=job`) | Agent D reads `assertPlanningEligible` before touching planning module |
| Board drag-drop performance at 1000+ tasks | Virtual scroll + bucket-level lazy load; do not fetch all tasks upfront |
| Terminology config in JSONB — translation of org-defined terms | Documented as user content; no automatic translation |
| Approvals RLS gap (documented in `approvals/SCHEMA_REQUEST.md`) | Agent E reads SCHEMA_REQUEST.md before touching approvals; fix gap as part of task approval integration |
| Navigation clutter (adding My Work, Portfolio, Workload) | Group under "Work" accordion section; existing nav model supports accordion groups |
| Agents editing shared files (navigation, schema barrel) | Lead owns those files; agents submit PRs/handoffs |

---

## X. EXACT FILE / MODULE AREAS EXPECTED TO CHANGE

### New files/modules
- `drizzle/schema/tasks.ts` — all task-related tables
- `src/modules/tasks/` — new module (domain, application, data, ui, validation)
- `src/app/[locale]/(app)/work/` — My Work routes
- `src/app/[locale]/(app)/portfolio/` — Portfolio routes
- `src/app/[locale]/(app)/workload/` — Workload routes
- `src/app/[locale]/(app)/projects/[projectId]/boards/` — Project boards route
- `src/app/[locale]/(app)/workspaces/` — Workspace routes
- `drizzle/schema/workspaces.ts` — workspaces, links, members, teams
- `src/app/[locale]/(app)/projects/[projectId]/tasks/` — Task list route
- `src/app/[locale]/(app)/settings/stages/` — Stage management
- `src/app/[locale]/(app)/settings/labels/` — Label management
- `src/app/[locale]/(app)/settings/task-templates/` — Task templates
- `src/app/[locale]/(app)/settings/project-templates/` — Project templates
- `src/locales/{he-IL,en,ar,ru}/tasks.json` + board + portfolio + workload + stages + meetings
- `drizzle/migrations/00NN_*.sql` (17 new files: N+0 through N+16)

### Modified files
- `drizzle/schema/index.ts` — export new tasks schema
- `src/shared/permissions/catalog.ts` — new permission keys
- `src/components/shell/navigation.ts` — new nav items
- `src/modules/calendar/data/source-dates.repository.ts` — add task dates
- `src/modules/command-center/data/collect-sources.ts` — add task source types
- `src/modules/command-center/domain/types.ts` — new source type enums
- `src/modules/notifications/domain/types.ts` — new event types
- `src/modules/automations/` — new trigger/action types
- `src/modules/tenancy/application/org-structure-templates.ts` — extend for task/stage templates
- `src/modules/tenancy/domain/saved-list-views.ts` — add list keys
- `src/modules/custom-fields/domain/types.ts` — add `task` entity type
- `src/modules/employee-app/application/presets.ts` — add task permission grants
- `src/app/[locale]/employee/(shell)/tasks/page.tsx` — add PM Tasks tab; preserve punch/safety tab
- `src/app/[locale]/(app)/operations/` — Operations Dashboard
- `src/modules/meetings/` — meetings, attendees, decisions, action items
- `src/app/[locale]/(app)/settings/modules/`, `settings/org-profile/`, `settings/adoption/`
- `src/app/[locale]/(app)/projects/[projectId]/page.tsx` — add Board + Tasks tabs
- `src/app/[locale]/(app)/projects/page.tsx` — add stage column, health indicator

---

## Y. ITEMS REUSED FROM EXISTING PROJECTFLOW

- `document_links` — task + task_comment attachments (add owner_type values)
- `custom_field_definitions` / `custom_field_values` — task custom fields (add entity type)
- `approval_requests` / `approve.ts` — task approval gate
- `notifications` table + emit/dedupe infrastructure — task notifications
- `audit_events` — audit complement to `task_activity`
- `automation_rules` executor (`run-rules.ts`) — extended with task triggers
- `saved_list_views` infrastructure — tasks + portfolio views
- `global-search.ts` — add task search kind with workspace + project-context access filter
- `calendar` module + `source-dates.repository.ts` — task date projections
- `planning_work_items` + `planning/` module — Gantt/timeline (write UI extended, not rewritten)
- `employee_project_assignments` — scope for task assignment suggestions
- `project_access_grants` — project-level task visibility
- `ResponsiveTable`, `DocumentAttachments`, `EntityCustomFieldsPanel` UI components
- `app.install_permissioned_rls()` pattern — all new tables
- Existing 4-locale i18n infrastructure (next-intl, routing, messages)
- Existing PWA/offline/mobile shell

---

## AA. SCOPE CLASSIFICATION (no "later" language)

Every capability is explicitly classified:

| Capability | Classification | Notes |
|---|---|---|
| Workspace / Plan layer | **IN SCOPE** | `project_workspace_links` sole project relation |
| Workspace access (`workspace_members`, visibility) | **IN SCOPE** | Section C |
| Org teams (`org_teams`, `org_team_members`) | **IN SCOPE** | New entity — no phantom FK |
| Bucket → status mapping (`status_on_enter`) | **IN SCOPE** | Board settings UI |
| Multiple boards per project | **IN SCOPE** | This program |
| Module enablement | **IN SCOPE** | UX/navigation only |
| Actor / assignee model (incl. system actor) | **IN SCOPE** | org_member \| employee \| system — section C |
| Shared workspace task project context | **IN SCOPE** | `tasks.project_id` authoritative — section C |
| Stage transition history | **IN SCOPE** | Immutable transitions |
| Meetings + Decisions | **IN SCOPE** | Agent I |
| Task recurrence (RRULE, TZ, idempotency) | **IN SCOPE** | Reuse service recurrence |
| Multi-cycle task approvals | **IN SCOPE** | Via existing approvals |
| Time entry ↔ task link | **IN SCOPE** | Operational only |
| Operations Dashboard | **IN SCOPE** | Agent I |
| Existing org adoption | **IN SCOPE** | Idempotent seeding |
| Org-shared saved views | **IN SCOPE** | Extend `saved_list_views` |
| Comment threading | **EXCLUDED** | Flat comments sufficient for MVP |
| External calendar sync | **EXCLUDED** | OAuth/provider scope outside program |
| Email/push notifications | **EXCLUDED** | In-app only; channels stubbed |
| Change-order task spawn | **EXCLUDED** | Separate workflow |
| Materialized portfolio view | **CONDITIONAL INFRA OPTIMIZATION** | Only if metrics prove need |

---

## Z. ITEMS THAT MUST NOT BE DUPLICATED

- Do NOT build a second Gantt engine — extend existing `planning_work_items` write UI
- Do NOT build a second notification center — extend existing `notifications` module
- Do NOT build a second approval inbox — extend existing `/approvals` route
- Do NOT build a second document storage system — extend `document_links.owner_type`
- Do NOT build a second permission/RBAC system — extend permission catalog
- Do NOT build a second search engine — add task kind to existing global search
- Do NOT build a second saved-views system — extend `savedListViews` list key enum
- Do NOT build a second custom-fields engine — extend entity_type enum
- Do NOT build a second automation executor — extend `automation_rules` types
- Do NOT build a second activity/audit system — use `task_activity` for task events, complement with `audit_events`
- Do NOT modify any financial calculation — financials engine is strictly read-only from this program

---

## FINAL REPORT

```
PROJECTFLOW UNIVERSAL WORK MANAGEMENT MASTER PLAN V3.1 = READY FOR FINAL OWNER APPROVAL

Document is self-contained implementation contract = YES REQUIRED

System actor model = RESOLVED
System-generated recurrence = RESOLVED
System-generated automation activity = RESOLVED

Shared workspace task context = RESOLVED
Task project attribution = tasks.project_id authoritative when non-null
Cross-project access leakage = 0 REQUIRED
Shared workspace closeout contradiction = 0 REQUIRED

Architecture contradictions remaining = 0 REQUIRED
Duplicate sources of truth = 0 REQUIRED
Undefined actor states = 0 REQUIRED
Undefined access states = 0 REQUIRED
Undefined permission scopes = 0 REQUIRED
Stale V1 references = 0 REQUIRED
Unowned implementation areas = 0 REQUIRED
External chat instructions required after approval = 0 REQUIRED

Workspace/project membership = project_workspace_links ONLY (UNIQUE workspace_id+project_id)
Task project context = tasks.project_id explicit attribution; validated against links
Workspace access model = workspace_visibility + workspace_members + project access per task context
Team model = org_teams + org_team_members
Actor model = org_member | employee | system (creator + activity CHECK exactly one)
Employee actor model = author_employee_id / actor_employee_id (human comments/actions only)
Permission scopes = self | assigned_tasks | assigned_projects | workspace | organization
Bucket/status behavior = task_buckets.status_on_enter nullable (IN SCOPE)
Migration count = 17 (N+0 through N+16)
Migration preflight = Lead automatic
Stage current-state source = project_stage_transitions ORDER BY transitioned_at DESC, id DESC
Recurrence uniqueness = UNIQUE(rule_id, occurrence_at); created_by_system on generated tasks
Closeout semantics = per tasks.project_id; shared workspace stays active; workspace-wide tasks not frozen by single project close
Search access enforcement = workspace + project-context in SQL
Operations aggregation access = SQL-scoped; portfolio counts tasks.project_id = project only

Parallel agents = 9 (A–I) + Lead
Lead ownership = migration SQL, schema integration, access contracts, one-click release
Release workflow = CONTINUOUS / ONE-CLICK

After Owner approval:
Required Owner action = CLICK BUILD ONLY
Additional implementation approvals = 0 REQUIRED
Separate push approval = NO
Separate build approval = NO
Separate deploy approval = NO

Schema impact =
  29 new tables
  11 existing tables extended (additive)
  10 enum extensions
  0 financial calculation tables modified

Implementation started = NO
Application files changed = 0
DB writes = 0
Migrations created = 0
Commits = 0
Push = NO
Deploy = NO

STOP FOR FINAL OWNER APPROVAL.
```
