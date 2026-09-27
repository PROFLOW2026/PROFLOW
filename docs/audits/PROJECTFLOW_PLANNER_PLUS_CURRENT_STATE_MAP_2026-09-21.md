# ProjectFlow — Planner+ Expansion Current State Map

**Date:** 2026-09-21  
**Mode:** READ-ONLY mapping — no code, DB, or data changes  
**Purpose:** Accurate inventory of existing UWM (Universal Work Management) capabilities before Planner-like expansion

---

## Executive Summary

ProjectFlow already has a mature **Universal Work Management (UWM)** layer (migrations 0096–0114) sitting alongside an intact **financial/business engine**. The canonical work hierarchy is:

```
Organization
  └── Workspace → Board → Bucket → Task
  └── Project  ←──(project_workspace_links)──→ Workspace
```

**Project is NOT the parent of Workspace.** They are linked via `project_workspace_links` (many-to-many). Tasks live in workspaces; optional `tasks.project_id` attributes work to a project when a link exists.

UWM is **not** a Planner clone today. It is a task engine with bucket boards, My Work aggregation, portfolio/workload/operations dashboards, meetings, and shared permissions — all integrated with clients, contracts, billing, time, documents, and profitability boundaries that must remain untouched.

---

## Mapping Area 1 — Routes / Surfaces

All paths are locale-prefixed at runtime (`/[locale]/…`). Navigation uses locale-agnostic hrefs.

**App split:**
- **Owner App:** `src/app/[locale]/(app)/…` — `assertOwnerAppSurface`
- **Employee App:** `src/app/[locale]/employee/(shell)/…` — `assertEmployeeAppContext`
- **Middleware:** `src/proxy.ts` — locale + session only; no route ACL

**Module gate:** Optional module `work_management` required for most UWM nav items.

### Owner App — Projects & Legacy Work

| Surface | Route | Main component(s) | Loader / API | Data model | Permission(s) | Scope |
|---------|-------|-------------------|--------------|------------|---------------|-------|
| Projects list | `/projects` | `ProjectListFilters`, `SavedListViewsBar` | `listProjectsForOrg`, `countProjectsForOrg` | `projects` | `projects.read`; create: `projects.create` | Org |
| Project new | `/projects/new` | create form | `createProject` action | `projects` | `projects.create` | Org |
| Project detail hub | `/projects/[projectId]?tab=` | `project-tabs-shell`, hub panels | `loadProjectDetailInContext` | `projects` + tab modules | Tab-specific (see layout) | Project |
| Legacy **עבודה** tab | `?tab=work` | `WorkTab` | structure from project detail | `project_phases`, `project_work_packages` | Edit: `projects.update` | Project |
| Work hub siblings | `?tab=boq`, `changes`, `team`, `time`, `schedule`, `usage` | respective panels | project detail loaders | BOQ, changes, workforce, planning, materials | Tab gates in layout | Project |
| Project documents | `?tab=documents` | `DocumentsTab`, `ProjectFilesTab` | documents + external storage | `documents`, `document_links` | `documents.read` | Project |
| Project UWM links | header quick links | `ProjectUwmLinks` | — | — | — | → `/projects/[id]/tasks`, `/boards` |

### Owner App — UWM Tasks & Boards

| Surface | Route | Main component(s) | Loader / API | Data model | Permission(s) | Scope |
|---------|-------|-------------------|--------------|------------|---------------|-------|
| My Work | `/work` | `MyWorkView` | `getMyWork` | `tasks` | `tasks.read` + `work_management` | Org (access-filtered workspaces) |
| Global status board | `/work/board` | board by status columns | `listAccessibleTasks` | `tasks` | `tasks.read` | Org |
| Project task list | `/projects/[projectId]/tasks` | `_project-tasks-client`, `TaskListView` | `listAccessibleTasks`, `mapTasksToCardDataForOrg` | `tasks` | `tasks.read` | Project |
| Project board list | `/projects/[projectId]/boards` | board index | `findWorkspaceIdsByProject`, `listBoards` | `task_boards`, `workspaces` | `tasks.read` | Project → linked workspace |
| Project bucket board | `/projects/[projectId]/boards/[boardId]` | `_project-board-shell`, `BoardView` | `listBoards`, `listBuckets`, `listAccessibleTasks` | boards, buckets, tasks | `tasks.read` | Project + board |
| Workspace boards | `/workspaces/[workspaceId]/boards/[boardId]` | `BoardView` | same task module | workspaces, boards | `tasks.read` / `workspaces.manage` | Workspace |
| Task detail (full) | `/tasks/[taskId]` | comments, activity, approval gate | `getTaskDetailAction` | full task graph | `tasks.read` | Task |
| Workspaces index | `/workspaces` | workspace admin | workspace module | `workspaces` | `workspaces.manage` | Org |

**Server actions hub:** `src/app/[locale]/(app)/work/actions.ts`

### Owner App — Dashboards

| Surface | Route | Component | Loader | Permission | Scope |
|---------|-------|-----------|--------|------------|-------|
| Operations | `/operations` | ops dashboard | `getOperationsDashboard` | `operations.read` | Org |
| Portfolio | `/portfolio` | `PortfolioFiltersBar`, table | `getPortfolio` | `portfolio.read` | Org (accessible projects) |
| Workload | `/workload` | `WorkloadExpandableRows` | `getTeamWorkload` | `workload.read`; assign hints: `tasks.assign` | Org |
| Workload API | `GET /api/workload/employee-preview` | — | route handler | `workload.read` | Org |

### Owner App — Meetings, Documents, Time, Team

| Surface | Route | Loader | Permission | Scope |
|---------|-------|--------|------------|-------|
| Meetings list | `/meetings` | `listMeetingsForOrg` | `meetings.read` | Org |
| Meeting detail | `/meetings/[meetingId]` | `getMeetingDetailById` | `meetings.read` / `meetings.manage` | Org / project-linked |
| Meeting sub-routes | attendees, decisions, action-items, create-task | meetings module | manage + `tasks.create` for task creation | Org |
| Org documents | `/documents` | `listDocumentsForOrg` | `documents.read` + module `documents` | Org |
| Company files | `/company-files` | external browser | `documents.read` | Org |
| Time roster | `/workforce/time` | `listTimeEntriesForOrg` | `time.manage` / `time.approve` / `workforce.read` | Org / self |
| Project time tab | `?tab=time` | `ProjectTimePanel` | workforce module | `workforce.read` | Project |
| Project team tab | `?tab=team` | `ProjectTeamPanel` | `listProjectTeamMembers` | `workforce.read` | Project |
| People directory | `/workforce/employees` | employee list | `workforce.read` | Org |

**No dedicated Owner `/team` route.** Team = project tab + people directory.

### Owner App — Command Center, Search, Notifications

| Surface | Route | Component | Loader | Permission | Scope |
|---------|-------|-----------|--------|------------|-------|
| Today / Command Center | `/today` | `TodayInboxPanel` | `getTodayInbox` | `command_center.read` | Org |
| Notifications inbox | `/notifications` | `NotificationInboxClient` | `listMergedNotificationInbox` | `notifications.read` | Org |
| Notification bell | TopBar (AppShell) | `NotificationBell` | prefetch inbox | `notifications.read` | Org |
| Global search | **No page** — TopBar modal | `GlobalSearchLazy` | `globalSearchAction` → `searchTasks`, `searchProjects` | per hit type | Org, access-filtered |

### Employee App

Nav: `get-employee-shell.ts` → `buildEmployeeNavItems()`

| Surface | Route | Loader | Permission | Scope |
|---------|-------|--------|------------|-------|
| Home | `/employee` | `getEmployeePmTaskWorkSummary` | tasks section: `tasks.read` | Assigned |
| Time & attendance | `/employee/time` | attendance + hours | `attendance.self`, `time.manage`, etc. | Self + optional team |
| Projects | `/employee/projects` | `listEmployeeAssignedProjects` | `projects.read` | Assigned |
| Project hub | `/employee/projects/[projectId]` | `getEmployeeProjectTaskOverview` | `projects.read` | Project |
| Project tasks | `…/tasks` | `buildEmployeeTaskListPayload` | `tasks.read` (grant scope) | Project |
| Project board | `…/board` | status-column board | `tasks.read` | Project |
| Project files | `…/files` | `listEmployeeProjectDocuments` | `documents.read` | Project |
| Project meetings | `…/meetings` | `listEmployeeProjectMeetings` | `meetings.read` | Project |
| Global tasks | `/employee/tasks` | PM + field/service tasks | `tasks.read` / field/service/planning | Assigned |
| Task detail | `/employee/tasks/[taskId]` | `getEmployeePmTaskDetail` | task grants | Task |
| Team roster | `/employee/team` | `listEmployeeTeamRoster` | `workforce.read` or attendance | Grant-scoped |
| Meetings | `/employee/meetings` | `buildEmployeeMeetingListPayload` | `meetings.read` | Read-only |
| Documents | `/employee/documents` | `listDocumentsForEntity` | `documents.read`, `assigned_only` | Self |

**Employee task actions:** `src/app/[locale]/employee/(shell)/tasks/actions.ts`

---

## Mapping Area 2 — Work-Management Data Model

**Verified hierarchy (corrected):**

```
Organization
  ├── workspaces (types: project_linked | org_internal | team)
  │     ├── workspace_members
  │     ├── task_boards → task_buckets
  │     └── tasks (+ satellites)
  ├── project_workspace_links ←→ projects
  ├── org_teams → org_team_members
  └── project_stage_definitions → project_stage_transitions
```

### Core tables

| Entity | Table | Purpose | Key FKs | Org / project context |
|--------|-------|---------|---------|------------------------|
| Workspace | `workspaces` | Canonical work container | `organization_id`; optional `org_team_id` | Org-owned; no `project_id` column |
| Workspace member | `workspace_members` | Restricted workspace ACL | `workspace_id`, org_member or employee | Org |
| Project link | `project_workspace_links` | **Sole** project↔workspace bridge | `workspace_id`, `project_id` UNIQUE | Validates `tasks.project_id` |
| Board | `task_boards` | Kanban board in workspace | `workspace_id` | Multiple boards per workspace |
| Bucket | `task_buckets` | Board column | `board_id`; `status_on_enter`, `wip_limit`, lexorank | Multiple buckets per board |
| Task | `tasks` | Canonical PM task | `workspace_id` required; optional `board_id`, `bucket_id`, `project_id` | Org; project optional |
| Assignee | `task_assignees` | Many assignees | `task_id`; org_member OR employee | Org |
| Checklist | `task_checklist_items` | Sub-items with optional assignee/due | `task_id` | Org |
| Dependency | `task_dependencies` | finish_to_start, blocked_by | source/target → tasks | Org |
| Follower | `task_followers` | Notification watchers | `task_id`, org_member | Org |
| Comment | `task_comments` | Human conversation (flat) | author org_member OR employee | Org |
| Activity | `task_activity` | Append-only audit | actor org_member OR employee OR system | Org; never UPDATE/DELETE |
| Label | `task_labels`, `task_label_assignments` | Org-wide tags | org + task M:N | Org (not workspace-scoped) |
| Recurrence | `task_recurrence_rules`, `task_recurrence_occurrences` | RFC5545 RRULE | links back to `tasks` | Org |
| Templates | `task_templates`, `project_templates`, … | Task/project templates | org | Org |
| Meeting | `meeting_records` + attendees/decisions/action_items | Meeting management | optional `project_id`, `workspace_id`; `action_items.task_id` | Org |

### Identity model (invariant)

Every human actor is **exactly one** of:
- `org_member_id` (Owner App users via `organization_memberships`)
- `employee_id` (Employee App users via `employees`)

System actors use `created_by_system` / `actor_system`. Resolution: `src/modules/tasks/domain/actor.ts`.

### Schema drift (migration applied, drizzle/app partial)

| Item | Migration | Gap |
|------|-----------|-----|
| `document_owner_type` + `'task'`, `'task_comment'` | 0107 | Missing from drizzle enums + documents domain types |
| `custom_field_definitions.entity_type` + `'task'` | 0107 | Drizzle CHECK still excludes `'task'` |
| `planning_work_items.task_id` | 0110 | Column in DB; not in drizzle planning schema; no app usage |
| `time_entries.task_id` | 0107 | Column in DB; not in drizzle workforce schema; no app usage |
| `projects.is_read_only`, `closed_at` | 0111 | Not in drizzle projects schema yet |

---

## Mapping Area 3 — Task Capabilities Matrix

| Capability | Status | Implementation |
|------------|--------|----------------|
| Title | **EXISTS** | `tasks.title`; all CRUD + UI |
| Description / Notes | **EXISTS** | `tasks.description`; detail sheet + full page |
| Status | **EXISTS** | enum: todo, in_progress, in_review, blocked, done, cancelled |
| Priority | **EXISTS** | enum: none → urgent |
| Start date | **EXISTS** | `tasks.start_date` |
| Due date | **EXISTS** | `tasks.due_date` |
| Completion | **EXISTS** | `tasks.completion_date`, `completed_by_*` |
| Assignee(s) | **EXISTS** | `task_assignees` |
| Multiple assignees | **EXISTS** | M:N assignees table |
| Employee identity | **EXISTS** | `task_assignees.employee_id` |
| Org member identity | **EXISTS** | `task_assignees.org_member_id` |
| Checklist | **EXISTS** | `task_checklist_items`; `manage-checklist.ts`; drawer if items exist |
| Comments | **EXISTS** | `task_comments`; full page + employee detail |
| Activity | **EXISTS** | `task_activity`; full page owner only |
| Exact timestamps | **EXISTS** | `created_at`, `updated_at` on all entities |
| Author identity | **EXISTS** | comment/activity actor columns |
| Attachments | **PARTIAL** | DB: `document_links(owner_type='task')`; UI stub empty (`_task-api-stub.ts`) |
| Project | **EXISTS** | `tasks.project_id` + FK to `project_workspace_links` |
| Project number | **PARTIAL** | Search matches `projects.document_number`; display uses `formatProjectDisplayName(name, documentNumber)` |
| Board | **EXISTS** | `tasks.board_id` |
| Bucket | **EXISTS** | `tasks.bucket_id`; drag via `move-task-to-bucket.ts` |
| Labels | **EXISTS** | `manage-labels.ts`; board group-by; detail sheet |
| Estimated effort | **EXISTS** | `estimated_effort_minutes`; workload display |
| Actual time | **MISSING** | No task-level actual; `time_entries.task_id` in DB only |
| Task approval | **PARTIAL** | `approval_required` + `approval_requests(entity_type='task')`; UI on full page |
| Postpone +1 day | **PARTIAL** | Employee only: `EmployeePostponeMenu` |
| Postpone +1 week | **PARTIAL** | Employee only |
| Custom due date (postpone) | **PARTIAL** | Employee only |
| Recurrence | **PARTIAL** | Full backend (`schedule-recurrence.ts`); **no create/edit UI**; **no cron job** |
| Reminder | **MISSING** | No `task_reminders` table or user-set reminders |
| Dependencies | **PARTIAL** | Backend + cycle detection; **no detail UI** |
| Parent/subtask | **PARTIAL** | `parent_task_id`; create supports; max 2 levels documented, not enforced in app |
| Copy/duplicate task | **MISSING** | No application function found |
| Task templates | **PARTIAL** | Schema + `task_templates`; project template apply exists; standalone task template UI limited |
| Archived tasks | **EXISTS** | `is_archived`, `archived_at` |
| Cancelled tasks | **EXISTS** | status = `cancelled` |

---

## Mapping Area 4 — Planner Comparison

Microsoft Planner used as **product reference only**.

| Planner concept | ProjectFlow equivalent | Status | Reuse existing? | Notes |
|-----------------|------------------------|--------|-----------------|-------|
| My Day | My Work `today` view (`/work?view=today`) | **PARTIAL** | Yes | Not branded "My Day"; similar time window |
| My Tasks | My Work `assigned_to_me` + `/employee/tasks` | **FULL** | Yes | Owner + Employee surfaces |
| My Plans | Workspaces + linked projects | **PARTIAL** | Yes | No "Plan" entity; see Area 6 |
| Plan (container) | Workspace (+ project link) | **PARTIAL** | Yes | |
| Board view | Bucket Kanban `BoardView` | **FULL** | Yes | Also global status board at `/work/board` |
| Grid view | `TaskListView` (table) | **PARTIAL** | Yes | List/table, not Planner-style editable grid |
| Timeline | — | **MISSING** | Extend tasks or planning layer | `planning_work_items` is separate Gantt layer |
| Calendar | Org `/calendar` includes task due dates | **PARTIAL** | Yes | `source-dates.repository.ts` queries `tasks.due_date`; not a dedicated task calendar UX |
| Charts | — | **MISSING** | Portfolio/operations stats only | No task chart view |
| Buckets | `task_buckets` | **FULL** | Yes | WIP limits, status-on-enter |
| Task cards | `TaskCard`, board cards | **FULL** | Yes | |
| Status | `task_status` enum | **FULL** | Yes | Richer than Planner (in_review, blocked) |
| Priority | `task_priority` enum | **FULL** | Yes | |
| Start / Due dates | `start_date`, `due_date` | **FULL** | Yes | |
| Repeat | `task_recurrence_rules` | **PARTIAL** | Yes | Backend only |
| Bucket assignment | `bucket_id` + drag | **FULL** | Yes | |
| Assignee | `task_assignees` | **FULL** | Yes | Supports employee + org member |
| Checklist | `task_checklist_items` | **FULL** | Yes | |
| Notes | `description` | **FULL** | Yes | |
| Attachments | `document_links` | **PARTIAL** | Yes | Must wire documents module; do not duplicate storage |
| Comments | `task_comments` | **FULL** | Yes | Flat (no threading — intentional) |
| Labels | `task_labels` | **FULL** | Yes | Org-scoped, not Planner "labels per plan" |

---

## Mapping Area 5 — Project ↔ Work Management

### Canonical vs UI structure

| Concept | Canonical? | Notes |
|---------|------------|-------|
| `tasks` row | **Yes** | Source of truth for PM tasks |
| `project_workspace_links` | **Yes** | Sole project↔workspace membership |
| `tasks.project_id` | **Yes** (optional attribution) | Validated server-side via composite FK |
| `task_boards` / `task_buckets` | **Yes** | UI container structure within workspace |
| Lazy project workspace | **Convention** | `lazyCreateProjectWorkspace()` on first board access |

### Answers to specific questions

1. **What is canonical?** `tasks`, `workspaces`, `project_workspace_links`, `task_boards`, `task_buckets`, `task_assignees`, comments, activity.
2. **What is UI/container?** Board/bucket layout, global status board grouping, My Work tab filters.
3. **One Project → multiple Boards?** **Yes.** Multiple `task_boards` per linked workspace; default board flag exists.
4. **One Board → multiple Buckets?** **Yes.** `task_buckets.board_id`.
5. **Tasks without Project?** **Yes.** `project_id` nullable = workspace-wide task.
6. **Project context enforced server-side?** **Yes.** `validateProjectContext()` on create/update; composite FK in schema.
7. **Project number/name enrichment?** `loadProjectDisplayNameMap()` → `formatProjectDisplayName(name, documentNumber)` via `map-tasks-for-ui.ts`.
8. **Project permission limits task visibility?** **Yes.** Search and portfolio use `resolveAccessibleProjectIds()`; tasks with `project_id` filtered to accessible projects; workspace membership also required.

---

## Mapping Area 6 — "Plan" Question (Recommendation Only)

**Do NOT implement a new Plan entity.**

| Candidate | Fit | Recommendation |
|-----------|-----|----------------|
| **Project** | Strong business anchor; financial/commercial context; project number | Best **business-facing** "plan" label |
| **Workspace** | Actual task container; supports org_internal/team types | Best **technical** Planner "Plan" equivalent |
| **Board** | View/layout only | Too narrow — multiple boards per workspace |
| **Project + Board** | What users see on `/projects/[id]/boards` | Best **user-facing** composite |

**Recommendation:** Treat **Workspace linked to Project via `project_workspace_links`** as the Planner "Plan" equivalent for UWM. Surface it to users as **the project's work board area** (project name/number from Project, tasks/boards from Workspace). For org-internal or team workspaces without a single project, the Workspace itself is the plan container. **Do not duplicate** with a new Plan table.

---

## Mapping Area 7 — Views

| View | Route(s) | Data source | Filtering | Project scope | Employee scope | Pagination | Usable? |
|------|----------|-------------|-----------|---------------|----------------|------------|---------|
| Board (bucket) | `/projects/…/boards/[id]`, `/workspaces/…/boards/[id]` | `listAccessibleTasks` by bucket | Inline: assignee, label, priority, overdue | Yes | Employee project board (status columns, not buckets) | Client-side columns | **Full** owner; **Partial** employee |
| Board (status) | `/work/board`, `/employee/projects/[id]/board` | tasks grouped by status | Limited | Optional | Yes | — | **Full** |
| List / table | `/projects/[id]/tasks`, `/work`, `/employee/tasks` | `listAccessibleTasks`, `getMyWork` | Server + URL + client (employee) | Yes | Yes | My Work paginated | **Full** |
| Grid | — | — | — | — | — | — | **MISSING** |
| Calendar | `/calendar` | `listExistingDatedSources` includes tasks | Date range | Mixed sources | — | Capped | **Partial** (tasks as one source type) |
| Timeline | — | — | — | — | — | — | **MISSING** for UWM |
| Gantt | `?tab=schedule` | `planning_work_items` | Project | Yes | — | — | **Separate layer** (not UWM tasks) |
| Workload | `/workload` | `getTeamWorkload` | Employee picker | Org | — | Expand rows | **Full** |
| Portfolio | `/portfolio` | `getPortfolio` | URL + saved views | Org accessible projects | — | Yes | **Full** |
| Operations | `/operations` | `getOperationsDashboard` | — | Org | — | — | **Full** (dashboard, not task view) |
| Charts | — | — | — | — | — | — | **MISSING** for tasks |
| My Work | `/work` | `getMyWork` | 8 tabs: today, overdue, this_week, upcoming, waiting, assigned_to_me, created_by_me, following, completed | Org | — | Yes | **Full** |

**Responsive:** Board collapses to single-column cards on mobile; no DnD on mobile (`board-view.tsx`). Bottom nav on owner mobile (`mobile-nav.tsx`).

---

## Mapping Area 8 — Filtering / Search

### Server-side (`TaskListFilters` in `tasks.repository.ts`)

| Filter | Supported |
|--------|-----------|
| Text search (title ILIKE) | Yes |
| Project ID | Yes |
| Project number | Via global search JOIN on `projects.document_number` |
| Project name | Via enrichment, not filter field |
| Status | Yes |
| Due date / range | `dueBefore`, `dueAfter` |
| Assignee (org member / employee) | Yes |
| Priority | Yes |
| Board / bucket | Yes |
| Labels | Yes |
| Open/completed | Via status + `includeArchived` |
| Assigned-to-me | My Work view + employee filters |
| Company-wide | `listAccessibleTasks` across accessible workspaces |
| Project-specific | `projectId` filter |

### Shared infrastructure to reuse

- `TaskListFilters` + `listAccessibleTasks` / `listTasks`
- `MyWorkView` presets in `my-work.repository.ts`
- `owner-list-filter-bar.tsx` (collapsible mobile pattern)
- `SavedListViewsBar` + `saved-list-views.repository.ts` (portfolio, projects)
- `global-search.ts` + `search.repository.ts` (workspace + project access filters)
- Employee: `employee-filter-logic.ts` (client-side on loaded payload)

---

## Mapping Area 9 — Comments / Activity / History

### Comments (`task_comments`)

| Aspect | Detail |
|--------|--------|
| Storage | `task_comments` table |
| Authors | `author_org_member_id` OR `author_employee_id` |
| Timestamps | `created_at`, `updated_at`; soft delete |
| Threading | **None** (explicit design decision, migration 0102) |
| Write permission | `tasks.comment` |
| Owner path | `create-task-comment.ts` |
| Employee path | `addEmployeePmTaskComment()` in `employee-pm-tasks.ts` |
| Side effect | Inserts `task_activity` event `comment_added` |

### Activity (`task_activity`)

| Aspect | Detail |
|--------|--------|
| Storage | Append-only `task_activity` |
| Event types | created, status_changed, assignee_added, comment_added, approval_result, attachment_added, … |
| Payload | JSONB before/after values |
| Read | `list-task-activity.ts`; requires `tasks.read` |
| System events | `actor_system` for automation/recurrence |

### Access & permanence

- Task history is **append-only** by schema contract.
- Visibility follows **task read access** (workspace + project grants).
- **No evidence** that activity rows are deleted when project access is revoked — history should remain permanent (rows stay; read gate applies on query).
- **Do not create another history system.**

---

## Mapping Area 10 — Meetings

### Schema

```
meeting_records (org, optional project_id, workspace_id, scheduled_at, notes)
  ├── meeting_attendees (org_member | employee | contact | display_name)
  ├── meeting_decisions (decider org_member | employee)
  └── meeting_action_items (assignee, due_date, status, task_id → tasks)
```

### Flows

| Flow | Status |
|------|--------|
| Meeting → linked Task | **EXISTS** — `createTaskFromActionItem()` sets `source='meeting_action'` |
| Project link | Optional `project_id` on meeting |
| Owner CRUD | `/meetings/*` with `meetings.manage` |
| Employee visibility | Read-only lists; attendee OR project-in-scope |
| Filters | Org list + project-scoped employee lists |

### Future Planner+ role

Meetings already produce **action items → tasks** on the same canonical `tasks` table. Future work should **surface meeting action items in My Work / project boards** rather than a parallel action-item system.

---

## Mapping Area 11 — Documents / Attachments / External Storage

### Architecture

| Layer | Table / module |
|-------|----------------|
| Metadata | `documents`, `document_links` (polymorphic `owner_type`, `owner_id`) |
| Supabase legacy | `storage_bucket`, `storage_path` |
| External providers | `organization_storage_connections` — **onedrive, google_drive, dropbox, box** |
| Semantic folders | `SEMANTIC_FOLDER_TYPES` in external-storage schema |
| Browser | `external-storage/application/browser-service.ts` |

### Scope surfaces

| Surface | Owner | Employee |
|---------|-------|----------|
| Org library | `/documents`, `/company-files` | `/employee/documents` (metadata only, category grants) |
| Project files | `?tab=documents` + `ProjectFilesTab` (external browser) | `/employee/projects/[id]/files` (metadata, no browser) |
| Task attachments | **NOT WIRED** | — |

**Future task files must reuse `document_links(owner_type='task')`** — no parallel upload/storage.

---

## Mapping Area 12 — Permissions / Authorization

### Work-management permission keys

```
tasks.read | create | update | delete | assign | manage_all | comment | approve
documents.read | manage
meetings.read | manage
planning.read | write
projects.read | create | update | archive | access_all
workforce.read | manage | time.manage | time.approve | …
portfolio.read | workload.read | operations.read
workspaces.manage | stages.manage | labels.manage
task_templates.manage | project_templates.manage
```

Catalog: `src/shared/permissions/catalog.ts`

### Scopes (Employee App grants)

`self_only` | `assigned_only` | `granted_projects` | `all_organization`

Defaults: `scopes.ts` — project-linked permissions default to `assigned_only`.

### Operation matrix (authoritative gates)

| Operation | Permission | Scope notes |
|-----------|------------|-------------|
| READ tasks | `tasks.read` | Workspace membership + project access filter; employee scope via `task-permission-scope.ts` |
| CREATE | `tasks.create` | Project must be in employee scope if `project_id` set |
| UPDATE | `tasks.update` or `tasks.manage_all` | Employee: assignee check for `self_only` |
| ASSIGN | `tasks.assign` | Distinct from update |
| COMMENT | `tasks.comment` | Separate from update |
| APPROVE | `tasks.approve` | `approval_requests` entity_type task |
| MANAGE boards/buckets | `workspaces.manage` | Not `tasks.manage_all` |
| READ documents | `documents.read` | Does not grant manage |
| MANAGE documents | `documents.manage` | |

**Invariant:** READ scope must NOT expand UPDATE scope — enforced separately in `employeeCanExerciseTaskPermission()` vs read list filters.

### Identity resolution

- Owner users → `context.membershipId` (org_member)
- Employee users → `context.employeeApp.employeeId`
- Linked employee for owner My Work → `findEmployeeByUserId()`

Central gate: `authorize.ts` + `assertEmployeeCanExerciseTaskPermission()`.

---

## Mapping Area 13 — Owner App vs Employee App

| Feature | Owner App | Employee App | Same data? | Permission difference |
|---------|-----------|--------------|------------|----------------------|
| Projects | Full hub + financials | Assigned list + hub | Yes | Employee: grant scopes |
| Tasks | Full CRUD, My Work, detail page | List, detail, postpone | Yes | Granular grants; `self_only` for assignees |
| Boards | Bucket Kanban + admin | Status-column board only | Yes | No bucket DnD admin |
| Meetings | Full CRUD + action→task | Read-only lists | Yes | No `meetings.manage` |
| Documents | Full + external browser | Metadata + category grants | Yes | No external browser |
| Time | Org roster + approvals | Self + team sections | Yes | `time.manage` vs approvals |
| Team | Project tab + people dir | Roster page | Yes | Grant-scoped |
| Portfolio | `/portfolio` | — | — | Owner only |
| Workload | `/workload` | — | — | Owner only |
| Operations | `/operations` | — | — | Owner only |
| Workspaces admin | `/workspaces` | — | — | Owner only |
| Global search | TopBar modal | Local project search only | Partial | Owner only |

Employee App remains **operational**, not a second finance/owner system.

---

## Mapping Area 14 — Legacy "עבודה"

**Route:** `/projects/[projectId]?tab=work` (hub: `work` in `project-hub-order.ts`)

### What the Work hub includes

| Section | Tab key | Content | Overlaps UWM? |
|---------|---------|---------|---------------|
| Work packages & phases | `work` | `WorkTab` — split project, phases, WPs, progress %, org packs | **NO** — construction structure, not PM tasks |
| BOQ | `boq` | Bill of quantities | **NO** |
| Changes | `changes` | Change orders | **NO** (commercial) |
| Team | `team` | `ProjectTeamPanel`, assignments | **Partial** — workforce assignments ≠ task assignees |
| Time | `time` | `ProjectTimePanel`, time entries | **Partial** — same `time_entries`, not linked to UWM tasks |
| Schedule | `schedule` | `ProjectSchedulePanel`, Gantt (`planning_work_items`) | **NO** — separate planning layer |
| Usage | `usage` | Materials/assets | **NO** |

**Visibility:** Work packages tab shown when `activePackageCount > 1`; otherwise split-project CTA.

**UWM separation:** `ProjectUwmLinks` explicitly states UWM tasks/boards do **not** replace this tab.

**DO NOT:** rename, remove, merge, or modify in this mapping phase.

---

## Mapping Area 15 — Financial / Profitability Integration Boundary

### Existing integration points (verified)

| Path | Exists? | Notes |
|------|---------|-------|
| Employee time → project | **YES** | `time_entries.project_id` |
| Time → labor cost → project actual | **YES** | `time-entry-cost-reconcile.ts`, budget actuals — **project-scoped** |
| Task → time entry | **NO (app)** | `time_entries.task_id` column in migration 0107 only |
| Task effort → cost | **NO** | `estimated_effort_minutes` is display/workload only |
| Task → billing milestone | **NO** | Billing separate chain |
| Project assignments → visibility | **YES** | `employee_project_assignments`, project access grants |
| Approved changes → contract | **YES** | Unchanged commercial engine |
| VAT / profitability | **YES** | Unchanged — do not touch |

### Safe future opportunities (if architecture supports — not implemented)

- Wire `time_entries.task_id` for operational attribution only (must not alter profitability formulas)
- Display task context on time entry UI without changing cost allocation rules
- Portfolio health using overdue task counts (already partially in operations dashboard)

**Financial invariants remain unchanged by this audit.**

---

## Mapping Area 16 — I18n / RTL / Design System

### Languages

| Locale | RTL | Config |
|--------|-----|--------|
| he-IL | Yes | Default locale |
| en | No | |
| ar | Yes | |
| ru | No | |

Config: `src/shared/i18n/config.ts`  
Direction: `direction.tsx`, `ltr-island.tsx`

### UWM namespaces

- `tasks.json` — status, priority, board, detail, errors (all 4 locales)
- `operations.json` — dashboard copy
- `employeeApp.json` — employee surfaces, postpone, filters
- `nav.json` — myWork, portfolio, workload, operations, workspaces, meetings

### Formatting

- Dates: business date helpers in `shared/dates`; locale-aware inputs (`lang={locale}`)
- Money: financial modules; UWM surfaces rarely expose money directly

### Shared UI to reuse

| Asset | Path |
|-------|------|
| UWM surface tokens | `src/shared/ui/uwm-surface-styles.ts` |
| Employee surface tokens | `src/modules/employee-app/ui/employee-surface-styles.ts` |
| shadcn primitives | `src/components/ui/*` (button, card, dropdown, alert, field) |
| Owner filter bar | `src/shared/ui/owner-list-filter-bar.tsx` |
| Task components | `task-card.tsx`, `board-view.tsx`, `task-list-view.tsx`, `task-detail-sheet.tsx` |
| Design tokens | CSS vars `--pf-*` (border, bg, action-primary, teal chips) |

---

## Mapping Area 17 — Mobile / Responsive / PWA

| Area | Behavior |
|------|----------|
| Desktop | Full sidebar, multi-column boards, table list |
| Tablet | Same breakpoints as desktop (`lg:` gates) |
| Mobile owner | Bottom nav max 4 items + "More" sheet; boards single-column, no DnD |
| Mobile employee | Bottom/side nav from employee shell |
| Task detail | Drawer on owner; full page for comments/activity |
| PWA | `manifest.webmanifest/route.ts`; offline module for field capture (not UWM-specific) |
| Filters | Collapsible panels on small screens |

**Structural limitations:** No native mobile bucket drag; Employee board uses status columns not bucket columns; global search not on employee app.

---

## Mapping Area 18 — Automation / Recurring Work

| Domain | Status | Notes |
|--------|--------|-------|
| Recurring tasks | **PARTIAL** | Full schema + `schedule-recurrence.ts`; **no Vercel cron** |
| Task reminders | **MISSING** | |
| Due-date alerts | **PARTIAL** | Command center collects overdue tasks; notification scanners partially on planning layer |
| Notifications | **PARTIAL** | Types defined (`task_assigned_to_you`, `task_due_soon`, …); not fully wired to UWM scan |
| Task templates | **PARTIAL** | DB + project template apply |
| Automation rules | **PARTIAL** | Triggers exist; task mutation actions **stubbed** in `run-rules.ts` |
| Command center | **EXISTS** | `/today` — separate from UWM task engine |
| Payment scheduling | **SEPARATE** | Recurring drafts/billing — not task scheduling |

---

## Mapping Area 19 — What ProjectFlow Already Does Better Than Planner

Where actually supported today:

1. **Business linkage** — tasks optionally attributed to projects with document numbers, clients, contracts context nearby
2. **Financial context** — same org session reaches profitability, billing, expenses (Owner App)
3. **Employee labor / time** — workforce time entries (project-level, not task-level yet)
4. **Meetings → tasks** — action items create canonical tasks with `source='meeting_action'`
5. **External document storage** — OneDrive/Google/Dropbox/Box at org/project level
6. **Granular scopes** — employee grants with self/assigned/granted/all
7. **Owner vs Employee surfaces** — same data, different operational depth
8. **Portfolio / workload / operations** — management dashboards beyond Planner
9. **Project pipeline stages** — `project_stage_definitions` for portfolio health
10. **Approval platform** — shared `approval_requests` for tasks (and expenses, etc.)
11. **Multi-workspace types** — org_internal, team, project_linked workspaces
12. **Richer task status model** — in_review, blocked, cancelled

Target: **Planner-like usability + ProjectFlow business intelligence**, not a clone.

---

## Mapping Area 20 — Consolidated Gap Matrix

| Capability | EXISTS | PARTIAL | MISSING | Reuse existing? | New model required? | Priority | Notes |
|------------|--------|---------|---------|-----------------|---------------------|----------|-------|
| Plans/Boards | ✓ | | | Yes | No | — | Workspace + task_boards |
| Buckets | ✓ | | | Yes | No | — | |
| Tasks | ✓ | | | Yes | No | — | Canonical |
| Checklist | ✓ | | | Yes | No | — | |
| Comments | ✓ | | | Yes | No | — | |
| Activity | ✓ | | | Yes | No | — | Append-only |
| Attachments | | ✓ | | Yes | No | High | Wire document_links |
| Recurrence | | ✓ | | Yes | No | Medium | Needs cron + UI |
| Labels | ✓ | | | Yes | No | — | |
| Calendar (task UX) | | ✓ | | Yes | No | Medium | Due dates in org calendar |
| Timeline | | | ✓ | Extend tasks or planning | Maybe | Medium | |
| Grid/List | | ✓ | | Yes | No | Low | List exists |
| Charts | | | ✓ | Portfolio stats | Maybe | Low | |
| My Day | | ✓ | | Yes (My Work today) | No | Low | Branding/UX |
| My Tasks | ✓ | | | Yes | No | — | |
| My Plans/Workspaces | | ✓ | | Yes | No | Medium | UX framing |
| Search | | ✓ | | Yes | No | Medium | Extend filters |
| Filters | ✓ | | | Yes | No | — | Server infrastructure solid |
| Meetings | ✓ | | | Yes | No | — | |
| Documents | ✓ | | | Yes | No | — | Task link unwired |
| Notifications | | ✓ | | Yes | No | Medium | Wire UWM scanners |
| Workload | ✓ | | | Yes | No | — | |
| Portfolio | ✓ | | | Yes | No | — | |
| Templates | | ✓ | | Yes | No | Medium | |
| Dependencies | | ✓ | | Yes | No | Medium | UI missing |
| Subtasks | | ✓ | | Yes | No | Medium | UI + depth enforce |
| Automations | | ✓ | | Yes | No | Medium | Un-stub actions |

---

## Mapping Area 21 — Reuse / Do Not Duplicate

### REUSE AS-IS

- `tasks`, `task_boards`, `task_buckets`, `task_assignees`
- `task_comments`, `task_activity`
- `workspaces`, `project_workspace_links`
- `task_labels`, `task_dependencies`, `task_checklist_items`
- `meeting_records` + action item → task flow
- `documents` + `document_links` + external storage providers
- Permission catalog + employee grant scopes
- `listAccessibleTasks`, `getMyWork`, global search infrastructure
- Owner/Employee app session guards
- UWM + employee surface styles, i18n namespaces

### REUSE WITH EXTENSION

- Task attachments → wire `document_links(owner_type='task')` to existing documents module
- Recurrence → add cron worker calling existing `schedule-recurrence.ts`
- `time_entries.task_id` → optional operational link (no formula changes)
- My Work / portfolio / calendar → surface existing data with Planner-like UX labels
- Automations → implement stubbed task actions in `run-rules.ts`
- Employee board → optional bucket view using same board APIs
- Notifications → point scanners at `tasks` table

### MISSING / MAY REQUIRE NEW CAPABILITY

- User-set **reminders** (no schema today)
- **Copy/duplicate task** action
- Dedicated **task timeline** view (unless planning link is chosen)
- **Task charts** view
- **Editable grid** (Planner Grid equivalent)
- Generic **related-task links** (non-dependency)

### DO NOT TOUCH

- Financial engine (billing, collections, receipts, VAT)
- Profitability formulas and true-cost chain
- Contract / approved changes logic
- Expense allocation and commitment vs actual rules
- Payroll / labor costing reconciliation
- Legacy **עבודה** tab (phases, WPs, BOQ, changes hub)
- Real organization / demo production data
- Existing permission architecture invariants (READ ≠ UPDATE scope)
- `planning_work_items` as schedule layer (do not merge with UWM without explicit decision)

---

## Duplicate Models & Architectural Risks

### Duplicate / parallel models found (intentional or drift)

| Model A | Model B | Risk |
|---------|---------|------|
| `tasks` (UWM) | `planning_work_items` (Gantt) | User confusion if both called "tasks" — keep separate |
| Bucket board | Global status board (`/work/board`) | Two board UX patterns — document which to extend |
| Legacy work tab | UWM project tasks | Overlap in name only — different data |
| `task_activity` | Audit log elsewhere | Do not add third history system |
| Migration 0107 task links | Drizzle schema | **Drift** — app may not see columns |

### Architectural risks

1. **Schema drift** — migrations 0107–0111 ahead of drizzle/app (task documents, time_entries.task_id, project closeout)
2. **Recurrence without cron** — occurrences won't generate in production
3. **Automations stubbed** — rules appear to work but don't mutate tasks
4. **Attachments stub** — UI shows empty; users may assume feature missing vs broken
5. **Employee postpone without owner equivalent** — inconsistent UX
6. **Project access revocation** — verify read gates on historical activity (permanent history intent)
7. **Workspace vs Project mental model** — expansion must not introduce a third "Plan" table

---

## Change Log (This Exercise)

| Item | Value |
|------|-------|
| CODE CHANGES | 0 |
| DB CHANGES | 0 |
| PRODUCTION DATA CHANGES | 0 |
| MIGRATIONS | 0 |
| COMMIT | NONE |
| PUSH | NONE |
| DEPLOY | NONE |

---

*End of read-only current state map.*
