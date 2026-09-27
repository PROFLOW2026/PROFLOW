# ProjectFlow — Full End-to-End System Flow + Access + Storage Mapping

**Date:** 2026-09-21  
**Mode:** READ-ONLY SYSTEM MAPPING  
**Scope:** Organization → Profitability lifecycle, permissions, documents, storage, journeys  
**Code changes:** 0 · **DB changes:** 0 · **Migrations:** 0 · **Commit:** NONE

---

## Executive Summary

ProjectFlow is a mature multi-module ERP with **two parallel permission systems** (Main RBAC vs Employee App grants), **three document visibility planes** (live provider browser vs `documents` registry vs employee category grants), and **intentionally separate construction (legacy עבודה) and UWM task layers**. Manual testing confusion is largely explained by **scope × permission × data-plane mismatches**, not missing connectivity.

**Highest-impact factual gaps:**
1. Employee Project Files reads **`document_links` registry**, not live Drive — Owner browser reads **provider API**.
2. `documents.read` granted + `assigned_only` scope → subset of documents only.
3. Calendar/Timeline crash: React **#441** — Server Component passes **function children** into `TaskWorkSurfaceClient`.
4. Project team at create: **STUB** (post-create team panel is FULL).
5. Employee category gate requires **`documents.category`** populated; uploads often leave it null.

---

## Section 1 — Organization Creation / Initial Setup

### How an organization becomes usable

| Step | Mechanism | File / table |
|------|-----------|--------------|
| Auth sign-in | Supabase Auth → profile upsert | `ensure-profile.ts` → `profiles` |
| No org yet | Redirect to onboarding | `withOrgContext()` → `/onboarding` |
| Org creation | `createOrganizationAction` → `createOrganization()` | `onboarding/actions.ts`, `create-organization.ts` |
| Founder membership | `insertMembership` active | `organization_memberships` |
| RBAC seed | `provisionOrganizationRoles()` from `ROLE_TEMPLATES` | `roles`, `role_permissions`, `role_assignments` |
| Cost categories | `seedDefaultCostCategories()` | `cost_categories` |
| Business catalogs | `seedUniversalBusinessCatalogs()` | business-catalog module |
| Branding | `ensureDefaultBranding()` | branding module |
| UWM module | `work_management` enabled for all new orgs | `organization_module_preferences` |
| Business profile (optional) | `applyBusinessProfileConfig()` | `organization_settings` |

**Duplicate-org guard:** If user already has memberships, onboarding resumes existing org — never creates second tenant.

### Fragmented setup (no single first-run wizard)

Setup is spread across **25+ `/settings/*` routes**:

| Route | Purpose |
|-------|---------|
| `/settings/org-profile` | Org profile type |
| `/settings/business` | Business profile |
| `/settings/modules` | Module toggles |
| `/settings/people` | Members + project access mode |
| `/settings/roles` | Role permissions |
| `/settings/storage` | External storage OAuth |
| `/settings/adoption` | Idempotent org defaults seed |
| `/settings/templates` | Structure + UWM templates |
| Tax, branding, invoicing, etc. | Domain-specific |

**Verdict:** Setup is **FRAGMENTED** across Settings; no coherent first-run flow beyond onboarding org row + owner role.

### Required before business use (implicit, not enforced)

- Storage connection (optional but required for external file UX)
- Clients (optional at project create)
- Employee app activation + grants (for field users)
- Project access mode configuration (`all` / `selected` / `assigned`)

---

## Section 2 — Human Identity Model

### Layer map

```
auth.users (Supabase)
  → profiles (display_name, locale)
  → organization_memberships (tenant membership)
      → role_assignments → roles → role_permissions → permissions (Main App)

employees (HR entity, optional user_id)
  → employee_app_accounts (Employee App login)
      → employee_permission_grants (per-permission + scope)
      → employee_document_category_grants
```

### When is a person what?

| Identity | Table | Main App | Employee App |
|----------|-------|----------|--------------|
| **Org member** | `organization_memberships` | Primary via RBAC | Only if also has employee role + active account |
| **Employee record** | `employees` | Used for workforce/time when linked via `user_id` | Primary via `employee_app_accounts.employee_id` |
| **Both (linked)** | `employees.user_id` = auth user | Role permissions + employee row for self ops | Employee grants **replace** role permissions in context |

### Linking & deduplication

- **Link:** `employees.user_id` → `auth.users.id` (unique per org)
- **Employee activation:** `activateEmployeeAppAccess()` — provisions auth if needed, links employee, applies preset grants
- **Dedup:** DB constraints on `(org_id, user_id)` for memberships and employees; global username uniqueness for app accounts
- **Task assignee dedup:** `listEffectiveProjectParticipants()` dedupes by `userId` (employee wins over org_member)

### Identity mismatch risks (FACTS)

| Risk | Evidence |
|------|----------|
| Permission on **org_member** RBAC but query uses **employee** scope | Employee App uses `employee_permission_grants`; Main uses `role_permissions`. `app.has_org_permission()` does NOT read employee grants. |
| Owner linked to employee | Gets role permissions in Main; employee context enrichment may **replace** permissions when employee role + active account |
| SQL `linked_employee_id()` vs app `employee_app_accounts.employee_id` | RLS uses `employees.user_id`; Employee App context uses account row |
| Project access: Main `assigned` mode uses `employees.user_id` join; Employee `assigned_only` uses `employee_project_assignments.employee_id` | Same human may resolve differently if link incomplete |
| `app.can_access_project()` ignores employee grant scopes | Employee project visibility is application-enforced via `project-scope.ts`; UWM RLS adds assignment path |

### What each persona uses

| Persona | Main App identity | Employee App identity |
|---------|-------------------|----------------------|
| Owner | Org member + owner role (all permissions) | Usually blocked by `assertOwnerAppSurface` |
| Secretary/Admin | Org member + custom/manager role | Possible if employee account activated with grants |
| Manager | Org member + manager role | PM presets with employee grants |
| Field employee | May have membership + employee role | `employee_app_accounts` + grants |

---

## Section 3 — Global Permissions

### Catalog

**Source of truth:** `src/shared/permissions/catalog.ts` — `PERMISSIONS`, `PERMISSION_CATALOG`, `ALL_PERMISSION_KEYS`

**Seeded globally:** `permissions` table via `drizzle/seed/system.ts`

### Two grant systems

| System | Storage | Used by |
|--------|---------|---------|
| **Main RBAC** | `role_assignments` → `role_permissions` | Owner/manager/worker/finance roles |
| **Employee App** | `employee_permission_grants` (+ scope column) | Employee App only |

**Role templates:** `src/shared/permissions/role-templates.ts`  
- `owner`: all keys  
- `manager`: broad subset incl. `projects.access_all`, expense keys  
- `employee`: baseline `[attendance.self]` — extended via grants at activation

### Permission flow (generic)

```
Permission UI (settings/roles or employee permission editor)
  → stored grant (role_permissions OR employee_permission_grants)
  → session load: resolveOrgContext() → loadEffectivePermissions()
  → Employee: enrichOrgContextWithEmployeeApp() REPLACES permissions from grants
  → context.permissions Set
  → route guard: page assertPermission / employeeHasPermission / notFound
  → service: assertPermission / authorize()
  → query: app-layer filter (resolveAccessibleProjectIds) + RLS
  → UI visibility: nav builders, tab gates, field capabilities
```

### Key permission helpers

| Function | File |
|----------|------|
| `hasPermission`, `assertPermission` | `src/shared/permissions/assert.ts` |
| `authorize`, `requirePermission` | `src/shared/permissions/authorize.ts` |
| `employeeHasPermission`, `employeePermissionScope` | `employee-app/application/load-employee-app-context.ts` |
| SQL `app.has_org_permission()` | `drizzle/migrations/0006_rls_hardening.sql` |
| SQL `app.has_employee_permission()` | `drizzle/migrations/0097_uwm_workspaces.sql` |

### Focus domains

| Domain | Read key | Manage/create keys | Route example |
|--------|----------|-------------------|---------------|
| projects | `projects.read` | `projects.create`, `projects.update` | `/projects`, `/projects/new` |
| tasks | `tasks.read` | `tasks.create`, `tasks.update`, `tasks.assign` | `/work`, employee tasks |
| documents | `documents.read` | `documents.manage` | `/documents`, `/company-files` |
| expenses | `expenses.read` | `expenses.create/update/finalize` | `/expenses` |
| meetings | `meetings.read` | `meetings.manage` | `/meetings` |
| time | `time.manage`, `workforce.read` | `time.approve` | `/workforce/time` |
| workforce | `workforce.read`, `workforce.manage` | team CRUD | `?tab=team` |
| planning | `planning.read` | planning manage keys | legacy work hub |
| portfolio/workload | module + read keys | — | `/portfolio`, `/workload` |
| financials | `project_financials.read`, `billing.read`, etc. | per domain | hub tabs, `/billing` |

**Critical distinction:** `project_financials.read` ≠ `expenses.read` — financial tab can load with expense slice explicitly denied.

---

## Section 4 — Scopes

### Scope values

**Defined:** `src/shared/permissions/scopes.ts` — `self_only`, `assigned_only`, `granted_projects`, `all_organization`

**Stored:** `employee_permission_grants.scope` only (Employee App). Main RBAC has **no scope column** on role permissions.

### Default scope per permission

| Pattern | Default scope |
|---------|---------------|
| `attendance.self`, `time.manage` | `self_only` |
| `projects.*`, `documents.*`, `field_ops.*` | `assigned_only` |
| Most others | `all_organization` |

### Effective scope calculation

| Function | File | Logic |
|----------|------|-------|
| `employeePermissionScope()` | `load-employee-app-context.ts` | From grant row; fallback `self_only` |
| `resolveAccessibleProjectIdsForEmployeePermission()` | `project-scope.ts` | Maps scope → project ID list or null (unrestricted) |
| `assertEmployeeProjectScope()` | `project-scope.ts` | Throws if resource outside scope |
| `employeeCanExerciseTaskPermission()` | `task-permission-scope.ts` | Task-level scope including self via assignee |

### Main vs Employee

| | Main App | Employee App |
|---|----------|--------------|
| Scope model | Org-wide RBAC + `project_access_mode` setting | Per-permission scopes on grants |
| `documents.read` + `assigned_only` | Uses `resolveAccessibleProjectIds()` + RLS | Uses grant scope + `assertCanReadDocumentForEmployee` |

### Example: `documents.read = YES`, scope = `assigned_only`

**Employee App:** Can read documents linked to projects in their accessible project set (assignments + grants per scope algorithm). Org-level documents (no project link) → **blocked** (`NotFoundError` in `document-access.ts`).

**Main App:** No employee-style scope on roles; project visibility via `project_access_mode` + `project_access_grants` + `projects.access_all`. Document list additionally filters via `resolveAccessibleProjectIds()` in `document-visibility.ts`.

---

## Section 5 — Project Access

### Mechanisms (all)

| # | Mechanism | Storage | Main | Employee |
|---|-----------|---------|------|----------|
| 1 | Org mode `all` | `organization_settings.project_access_mode` | All projects | All (if scope allows) |
| 2 | `projects.access_all` permission | role_permissions | Bypass mode | Only if grant includes it |
| 3 | Explicit grants | `project_access_grants` | Yes | Via `granted_projects` scope |
| 4 | Employee assignments | `employee_project_assignments` | Mode `assigned` | Primary for `assigned_only` |
| 5 | Role assignment project_id | `role_assignments.project_id` | V1 reserved, checked in SQL | Same |
| 6 | Creator grant | auto on create | `ensureProjectCreatorAccess()` | Employee → assignment row |
| 7 | RLS gate | — | `app.can_access_project()` | Same + UWM extensions |
| 8 | UWM assignment override | — | N/A | `uwm_can_access_project_context()` even when mode `selected` |
| 9 | Workspace ACL | `workspace_members` | Workspace-level | Both org_member and employee |

### SQL algorithm: `app.can_access_project(org_id, project_id)`

**File:** `drizzle/migrations/0050_wave3_operations.sql`

Order: org member → mode `all` → `projects.access_all` → `project_access_grants` → mode `selected` deny → mode `assigned` via assignments → false.

### Application mirrors

| Function | File |
|----------|------|
| `listAccessibleProjectIdsForUser()` | `projects/data/project-access.repository.ts` |
| `resolveAccessibleProjectIds()` | `projects/application/project-access.ts` |
| `resolveAccessibleProjectIdsForUser()` | `employee-app/application/project-scope.ts` |
| `assertCanAccessProject()` | `projects/application/project-access.ts` |

### Module consistency

| Module | Uses same algorithm? |
|--------|---------------------|
| Projects list | Yes — `resolveAccessibleProjectIds` |
| Tasks / UWM | Yes + workspace membership |
| Documents | Yes — `document-visibility.ts` |
| Expenses | **RLS only** — no app-layer project filter on org list |
| Meetings | RLS + employee attendee/project union |
| Financials | RLS `can_access_project` on project-linked rows |
| Employee PM tasks | `project-scope.ts` |

**HIGH PRIORITY FINDING:** Expense org list relies on RLS silently subsetting rows — no UI indication when manager sees incomplete list vs empty org.

---

## Section 6 — Project Creation

### Routes

| Surface | Path | Action | Core service |
|---------|------|--------|--------------|
| Main | `/[locale]/projects/new` | `createProjectAction` | `launchProject()` |
| Employee | `/[locale]/employee/projects/new` | `employeeCreateProjectAction` | `launchProject()` (direct) or `createProject` + ensure access |

### Full creation path

```
UI (ProjectCreateForm)
  → parseProjectCreateForm()
  → createProjectAction / employeeCreateProjectAction
  → launchProject()
      1. createProject() → projects row + default work_package + optional contract + storage folder
      2. ensureProjectCreatorAccess() → assignment OR project_access_grants
      3. lazyCreateProjectWorkspace() → workspaces + project_workspace_links
      4. Launch branch:
         blank → ensureDefaultProjectBoard()
         structure_template → applyStructureProjectTemplate()
         uwm_template → applyUwmProjectTemplate()
         clone_structure → cloneProjectStructure()
  → redirect to project hub
```

### Status matrix

| Capability | Main | Employee | Status |
|------------|------|----------|--------|
| Core fields | ✓ | ✓ | **FULL** |
| Client select/create | permission-gated | permission-gated | **FULL** |
| Finance / billing | permission-gated | permission-gated | **FULL** |
| Launch modes (structure/UWM/clone) | ✓ | hidden | Owner **FULL**, Employee **STUB** |
| **Team picker at create** | stub text | stub text | **STUB** |
| Creator access | ✓ | ✓ | **FULL** |
| Workspace + board | ✓ | ✓ (blank) | **FULL** |
| Templates | ✓ | not passed | Employee **MISSING** |

**Known issue confirmed:** Team section renders `create.sections.teamStub` — no write to `employee_project_assignments` at create.

---

## Section 7 — Project Team

### Canonical sources

| Concept | Table | Purpose |
|---------|-------|---------|
| **Formal team roster** | `employee_project_assignments` | Temporal assignments with role, dates, status |
| **Owner-app user access** | `project_access_grants` | Org member visibility when mode ≠ `all` |
| **Task assignees** | `task_assignees` | Per-task (separate from team roster) |

### Project Manager

**Detection:** `isProjectManagerRole()` on assignment `role` field — `projects/domain/project-participants.ts`  
**UI:** PM badge + "Mark as project manager" in `project-team-roster.tsx`

### UI surfaces

| Component | Route | Status |
|-----------|-------|--------|
| `ProjectTeamPanel` | Owner `?tab=team`, jobs hub | **FULL** |
| `ProjectScopedAccessPanel` | Grants for org members | **FULL** |
| Employee project hub | No team tab | **MISSING** |

### Participant vs access (critical distinction)

| | Participant | Access grant |
|---|-------------|--------------|
| **Who** | Employees on roster | Owner-app users |
| **Table** | `employee_project_assignments` | `project_access_grants` |
| **Means** | Assigned to project work | Can see project in Main app |
| **all_organization users** | May appear in participant pool via mode `all` branch | May see all projects without assignment row |

**Fact:** A secretary with `project_access_grants` can access project in Main without being on `employee_project_assignments` — may still appear in participant pool via grants branch in `listEffectiveProjectParticipants()`.

---

## Section 8 — Project Hub / Surfaces

### Main ProjectFlow (`/projects/[projectId]`)

**Hub order:** `project-hub-order.ts`  
**UWM links:** `project-uwm-links.tsx`

| Surface | Route/tab | Data layer | Status |
|---------|-----------|------------|--------|
| Overview | `?tab=overview` | compose financials if permitted | **FULL** |
| Legacy עבודה | work hub tabs | phases, WPs, BOQ | **FULL** (separate from UWM) |
| Tasks (UWM) | `/projects/[id]/tasks` | `tasks` + UWM | **FULL** |
| Board | `/projects/[id]/boards` | `boards`, `buckets` | **FULL** |
| Calendar | `/projects/[id]/calendar` | UWM tasks | **BROKEN** (#441) |
| Timeline | `/projects/[id]/timeline` | UWM tasks | **BROKEN** (#441) |
| Files | `?tab=documents` | live browser + registry panel | **FULL** |
| Meetings | `/meetings?projectId=` | meeting_records | **FULL** |
| Team | `?tab=team` | assignments + grants | **FULL** |
| Time | `?tab=time` | time_entries | **FULL** |
| Expenses | `?tab=expenses` | expenses | **FULL** (permission + RLS) |
| Financials | `?tab=financials` | compose engine | **FULL** (slice permissions) |

### Employee App (`/employee/projects/[projectId]`)

**Nav:** `employee-project-hub-nav.tsx`

| Surface | Route | Status |
|---------|-------|--------|
| Overview | `/employee/projects/[id]` | **FULL** |
| Tasks | `…/tasks` | **FULL** |
| Board | `…/board` | **PARTIAL** (status columns, not UWM buckets) |
| Calendar | `…/calendar` | **PARTIAL** (exists, **not in hub nav**) |
| Timeline | — | **MISSING** |
| Files | `…/files` | **FULL** (registry only, read-only list) |
| Meetings | `…/meetings` | **FULL** (read-only) |
| Legacy עבודה | — | **MISSING** (intentional) |

---

## Section 9 — Task Flow

### Lifecycle map

| Stage | Table/API | Main | Employee |
|-------|-----------|------|----------|
| Create | `insertTask`, `create-task.ts` | `/work`, project tasks, board | `/employee/tasks/new` |
| Assign | `task_assignees`, `sync-task-assignees.ts` | task detail, create forms | employee create + detail |
| Update | `update-task.ts` | sheet + full page | employee detail |
| Postpone | `PostponeMenu` | owner + employee | shared component |
| Checklist | task checklist JSON | detail sheet | partial |
| Comments | `task_comments` | owner detail | partial |
| Activity | `task_activity` | owner | partial on employee |
| Dependencies | `task_dependencies` | owner detail | limited |
| Subtasks | parent_task_id | owner detail | limited |
| Recurrence | recurrence + ops-worker cron | UI **PARTIAL** | limited |
| Reminders | `task_reminders` (0116) | UI **PARTIAL** (no delivery cron) | limited |
| Attachments | `document_links` owner_type=task | owner full page | **MISSING** employee UI |
| Time link | `time_entries.task_id` column | schema exists, UI wiring **PARTIAL** | employee time |
| Complete | status=`done` | both | both |

### Assignment rule (implemented)

**Rule:** Effective project participant may assign tasks in that project to other participants.

**Implementation:**
- `assertCanAssignOnTask()` — `task-assignment-auth.ts`
- Requires `tasks.assign` + project access + assignee in `listEffectiveProjectParticipants()`
- Employee mirror: `employeeCanExerciseTaskPermission()` + `task-permission-scope.ts`

**Canonical display:** `task_assignees` via `enrich-task-assignees.ts` — not `owner_employee_id` fields.

---

## Section 10 — Owner UWM Runtime

### Production state (2026-09-21, deployment `6d3b5c5`)

| Route | Status | Error |
|-------|--------|-------|
| `/work` (Tasks) | **PASS** | — |
| `/work/board` | **PASS** | — |
| `/work/insights` | **PASS** | — |
| `/work/calendar` | **FAIL** | React **#441** |
| `/work/timeline` | **FAIL** | React **#441** |

### Component path (shared failure)

```
Server page (calendar/page.tsx | timeline/page.tsx)
  → listAccessibleTasks + mapTasksToCardDataForOrg
  → TaskWorkSurfaceClient [Client Component]
       → passes Server Action refs (getTaskDetailAction, updateTaskFieldsAction)
       → children = RENDER PROP FUNCTION from Server Component:
            ({ filteredTasks, onOpenTask }) => <TaskCalendarView | TaskTimelineView />
```

**Also used by:** `/projects/[id]/calendar`, `/projects/[id]/timeline`

### React #441 root cause (evidence, NO FIX)

| Evidence | Detail |
|----------|--------|
| Error | React #441 = Server Components render error (production digest) |
| Shared component | **`TaskWorkSurfaceClient`** wraps both failing routes |
| Architectural pattern | Server Component passes **function children** into Client Component — non-serializable across RSC boundary |
| Working contrast | `/projects/[id]/tasks` uses `ProjectTasksClient` without render-prop — **PASS** |
| `/work` and `/work/board` | Use different shells (`MyWorkView`, `GlobalBoardView`) — **PASS** |
| Build | Succeeds; failure is **runtime** only |

**Verdict:** Calendar and Timeline share the **same failing architectural pattern** (`TaskWorkSurfaceClient` + render prop from RSC). Not the same component as #301 fix in `task-detail-sheet.tsx`.

---

## Section 11 — Document Data Model

### Canonical tables

| Table | Purpose |
|-------|---------|
| `documents` | Authorization/metadata record; `storage_backend`, `category`, `privacy_class`, external IDs |
| `document_links` | Polymorphic attach: `owner_type` + `owner_id` (34 owner types) |
| `document_folders` | PF-internal folder tree (not Drive folders) |
| `document_versions` | Version chain |
| `storage_files` | Bridge external file ID ↔ `document_id` |
| `storage_folder_mappings` | Semantic folder → external folder ID |

### Distinctions (A–E)

| Layer | What it is |
|-------|------------|
| **A. External provider file** | Bytes in Google Drive / OneDrive / etc. |
| **B. `documents` row** | ProjectFlow metadata + auth record |
| **C. `document_links`** | Attachment of document B to entity (task, project, etc.) |
| **D. Project files view (Owner)** | Live provider browser under provisioned mappings |
| **E. Company files / cloud browser** | Org-level live provider listing |

**Privacy classes:** `standard`, `compensation` (requires `workforce.cost.read` to view)  
**Categories:** `contract`, `invoice`, `receipt`, `photo`, `drawing`, etc. — `documents/domain/categories.ts`

---

## Section 12 — External Storage

### Connection architecture

| Step | Function | Permission |
|------|----------|------------|
| OAuth start | `beginStorageOAuth()` | `SETTINGS_MANAGE` |
| OAuth callback | `completeStorageOAuth()` | service |
| Root provision | `ensureOrganizationRootFolder()` | on connect |
| Bootstrap trees | `bootstrapOrganizationStorageTree()` | post-connect |
| Lazy project provision | `commitOrganizationStorageProvision()` | on first project browse |

**Providers:** OneDrive, Google Drive, Dropbox, Box — `organization_storage_connections`

### Upload → registry flow (creates PF knowledge)

```
prepareDocumentUpload() → documents row (pending) + document_links
  → POST /api/org-storage/upload/[documentId]
  → uploadDocumentToExternalStorage() → provider + storage_files
  → finalizeDocumentUpload() → status=available
```

### Pre-existing Drive files

**FACT: ProjectFlow does NOT auto-index existing Drive contents.**

Files appear in Owner **browser surfaces** if physically in provisioned folder tree.  
They do **NOT** appear in `/documents` registry or Employee Project Files unless uploaded/linked through PF.

**Browser-only upload** (`uploadOrgStorageFile`) writes to Drive **without** `documents` row.

---

## Section 13 — Storage Discrepancy (Connected but Employee sees empty)

### Observed

- **Main:** Google Drive CONNECTED; company cloud browser shows folders  
- **Employee:** Project CNS-27005 → "אין קבצים זמינים"

### Root causes (ordered)

| # | Cause | Evidence |
|---|-------|----------|
| 1 | **Different data planes** | Owner `ProjectFilesTab` → `adapter.listFolder()`; Employee → `listDocumentsForEntity(owner_type='project')` |
| 2 | **No auto-sync** | No background job indexes Drive into `documents` |
| 3 | **Category gate** | `canEmployeeReadDocumentCategory()` requires `documents.category` ∈ grant set; uploads often leave category **null** |
| 4 | **Empty category grants** | No rows in `employee_document_category_grants` → all docs filtered |
| 5 | **Missing document_links** | Drive-only files have no `document_links(owner_type='project')` |
| 6 | **Employee UI list-only** | No download/preview even when rows pass |

### Exact Employee query

**File:** `employee-project-documents.ts` → `listDocumentsForEntity()`  
**SQL filter:** `document_links.owner_type='project' AND owner_id=projectId AND documents.status<>'deleted'`  
**Post-filter:** `assertCanReadDocumentForEmployee()` per row (silent skip)

### Exact Owner project browser

**File:** `browser-service.ts` → `adapter.listFolder(accessToken, projectRootFolderId)` — **no SQL on files**

---

## Section 14 — Document Permission Flow

### Owner path

```
assertPermission(DOCUMENTS_READ)
  → assertCanReadStoredDocument() — privacy + project scope
  → listAllDocuments() with resolveAccessibleProjectIds filter
  → external browse: DOCUMENTS_READ on browser-service
```

### Employee path

```
employeeHasPermission(DOCUMENTS_READ)
  → canEmployeeReadDocumentCategory(documents.category)  ← NOT link.label
  → canSeeDocumentPrivacyClass()
  → assertEmployeeProjectScope per linked project
  → if no project links → NotFoundError (no org-level docs for employee)
```

### Manager granted "all permissions" but no documents — conditions

1. Missing `documents.read` (has only `project_financials.read`)
2. `project_access_mode=selected` without grants on document's project
3. Employee app: `assigned_only` scope excludes project
4. `documents.category` null or not in `employee_document_category_grants`
5. `privacy_class=compensation` without `workforce.cost.read`
6. Documents exist only in Drive browser, not in registry
7. Employee blocked from provider URLs (`browser-service.ts` throws for employee users)

---

## Section 15 — Folder/Category Access Capability

| Capability | Owner | Employee | Verdict |
|------------|-------|----------|---------|
| Cloud folder browse (org/project) | FULL | MISSING | **MISSING** employee |
| Semantic folder shortcuts | FULL | MISSING | **MISSING** |
| `document_folders` metadata tree | FULL | MISSING | **PARTIAL** |
| `documents.category` filtering | FULL | gate exists, uploads don't populate | **PARTIAL** |
| `employee_document_category_grants` | FULL config UI | FULL gate when populated | **PARTIAL** data path |
| Privacy class `compensation` | FULL | FULL | **FULL** |
| Project-scoped access | FULL | FULL | **FULL** |
| Download/preview | FULL | MISSING on employee files page | **PARTIAL** |
| Task attachments (employee) | FULL owner | MISSING | **MISSING** |
| Folder-level ACL by person | — | — | **MISSING** (future design) |

**Future folder permission design:** Current architecture supports **category + privacy class + project scope + permission** — not per-folder grants for field vs accounting.

---

## Section 16 — Company Files vs Project Files

| Surface | Data source | Same canonical system? |
|---------|-------------|------------------------|
| Company Files (cloud tab) | Live provider API | **Partially connected** — same storage connection, not registry |
| Company Files (registry shortcuts) | Links to `/documents?ownerType=` | Registry |
| Documents list | `documents` + filters | Registry |
| Owner Project Files tab | Live provider browser | **Disconnected from registry** |
| Owner attachment panel | `document_links` registry | Registry |
| Task attachments | `document_links` owner_type=task | Registry |
| Employee Project Files | `document_links` registry only | Registry |

**Verdict:** **Partially disconnected systems** — live browser vs metadata registry serve different UX purposes; Employee only sees registry path.

---

## Section 17 — Expense Access

### Visibility chain

```
expenses.read permission
  → route/tab visibility
  → listExpensesForOrg() / getExpense()
  → RLS: project_id IS NULL OR can_access_project(org, project_id)
  → (Employee) post-filter by grant scope
```

### Key facts

- **`expenses.read` alone is NOT sufficient** for project-scoped expenses if `can_access_project` fails
- App list has **no explicit project filter** — RLS silently subsets
- **`project_financials.read` without `expenses.read`:** financial tab loads, expense slice = `permission_denied`
- **Employee App:** `/employee/expenses` read-only list; no detail page; scope post-filter after RLS
- Default **manager** template includes `projects.access_all` — scoped visibility mainly affects custom roles

### Why manager may not see expenses

1. Missing `expenses.read`
2. `project_access_mode=selected` without grant on expense's project
3. Expense on project B, grant on project A
4. Employee `assigned_only` scope post-filter
5. No UI indicator that list is RLS-subsetted

---

## Section 18 — Meetings

### Model

`meeting_records` + `meeting_attendees` + `meeting_decisions` + `meeting_action_items` (optional `task_id`)

### Permissions

| Op | Key |
|----|-----|
| Read | `meetings.read` |
| Manage | `meetings.manage` |
| Create task from action | `meetings.manage` + `tasks.create` |

### RLS quirk

Org-wide meetings (no project/workspace) require **`meetings.manage` to read** at DB layer — not just `meetings.read`.

### Surfaces

| | Main | Employee |
|---|------|----------|
| List/detail | Full CRUD | Read-only |
| Project meetings | `/meetings?projectId=` | `/employee/projects/[id]/meetings` |
| Manage in Employee | — | **MISSING** |

---

## Section 19 — Time / Attendance

### Core: `time_entries`

- `project_id` required for project kind
- `task_id` optional — wired in app (`time-entries.ts`)
- `approval_status`: draft → submitted → approved
- Approved entries → labor Actual via compose (does not change formulas)

### Chain

```
Employee reports time
  → time_entries (approved)
  → sumProjectLaborCost
  → composeProjectFinancials labor slice
  → Project Actual
```

**Monthly allocation:** When `employee_month_costs` is monthly_allocated + closed, entries excluded from entry-level labor.

### Permissions

| Surface | Keys |
|---------|------|
| Org time roster | `time.manage` OR `workforce.read` |
| Approvals | `time.approve` |
| Project time tab | `workforce.read` |
| Employee time | `attendance.self`, `time.manage` grants |

---

## Section 20 — Financial Chain (Read-Only)

### Entity → surface → permission

```
Client → /clients → clients.read
Project → /projects → projects.read + can_access_project
Contract/CCV → ?tab=financials/contracts → contracts.read
Billing → /billing → billing.read
Collection → payments on /billing → billing.read
Expenses Actual → ?tab=expenses → expenses.read + RLS
AP → /procurement/ap → ap.read
Labor Actual → workforce + compose → workforce.read
Profit → ?tab=financials → project_financials.read + project_profit.read
```

### Compose engine (unchanged)

**Single source:** `compose-project-financials.ts`  
Each slice permission-gated independently — denial marks slice unavailable, not zero.

**Integrity boundaries (documented, not recalculated):**
- Actual ≠ Cash
- Expense + AP double-count risk without match
- Inventory ≠ Actual

---

## Section 21 — User Journeys

### Journey A — Owner (contractor)

| Step | Rating |
|------|--------|
| Create org + connect storage | **PARTIAL** (fragmented settings) |
| Create client + project | **PARTIAL** (team stub at create) |
| Add team post-create | **PASS** |
| Apply template + tasks | **PASS** (owner launch modes) |
| Upload project file (Owner browser) | **PASS** |
| Employee sees same files | **BROKEN** (registry disconnect) |
| Meetings + time + expenses | **PASS** / **CONFUSING** (scope) |
| Bill + collect + profit | **PASS** / **PARTIAL** (slice permissions) |
| Calendar/Timeline | **BROKEN** |

**Overall: PARTIAL**

### Journey B — Secretary / Office Admin

| Step | Rating |
|------|--------|
| Create project (Employee or Main if granted) | **PASS** if `projects.create` |
| Add team | **PASS** (post-create panel) |
| Upload documents | **PASS** (Owner); Employee **PARTIAL** |
| Create/assign tasks | **PASS** if participant + grants |
| See expenses | **CONFUSING** if scope/RLS limits |
| Calendar/Timeline | **BROKEN** |

**Overall: PARTIAL**

### Journey C — Project Manager

| Step | Rating |
|------|--------|
| See assigned/granted projects | **PASS** |
| Manage team | **PASS** (Owner tab) |
| Assign tasks to participants | **PASS** (new rule) |
| View plans/files | Owner **PASS**; Employee **PARTIAL** |
| Project expenses if granted | **CONFUSING** (RLS subset) |
| Unauthorized finance hidden | **PASS** (slice gates) |

**Overall: PARTIAL**

### Journey D — Field / Professional Employee

| Step | Rating |
|------|--------|
| See accessible projects/tasks | **PASS** |
| Assign task to participant | **PASS** if grants |
| View permitted files | **BROKEN/PARTIAL** (category + registry) |
| Report time | **PASS** |
| Task attachments | **MISSING** employee UI |
| Employee board vs UWM board | **CONFUSING** (different models) |

**Overall: PARTIAL**

### Journey E — Accounting User

| Step | Rating |
|------|--------|
| Financial tabs with correct keys | **PASS** |
| Expense/AP/billing surfaces | **PASS** if keys + project access |
| Operational photos/plans | **MISSING** unless `documents.read` + categories granted |
| Profitability | **PARTIAL** if slice permissions incomplete |

**Overall: PARTIAL**

---

## Section 22 — Permission Matrix (Evidence-Based)

| Capability | Permission | Scope (Employee) | Project access | Main | Employee | Status |
|------------|------------|------------------|----------------|------|----------|--------|
| Create project | `projects.create` | N/A / grant | creator access auto | ✓ | ✓ if grant | **FULL** |
| View projects | `projects.read` | assigned_only typical | required | ✓ | ✓ | **FULL** |
| Project team manage | `workforce.manage` | — | project access | ✓ tab | ✗ tab | **PARTIAL** |
| Create task | `tasks.create` | per grant | project scope | ✓ | ✓ | **FULL** |
| Assign task | `tasks.assign` | per grant | participant pool | ✓ | ✓ | **FULL** |
| Owner UWM calendar | `tasks.read` | — | — | ✗ #441 | — | **BROKEN** |
| Documents browse (cloud) | `documents.read` | — | — | ✓ | ✗ | **MISSING** employee |
| Project files (employee) | `documents.read` | assigned_only | + category grant | ✓ browser | registry only | **DISCONNECTED** |
| Expenses list | `expenses.read` | optional | RLS | ✓ | ✓ list only | **CONFUSING** scope |
| Meetings read | `meetings.read` | project scope | attendee OR project | ✓ | ✓ read-only | **FULL** |
| Time entry | `time.manage` | self_only typical | project on entry | ✓ | ✓ | **FULL** |
| Project financials | `project_financials.read` | — | project access | ✓ | limited | **PARTIAL** |
| Billing | `billing.read` | — | project on records | ✓ | ✗ | Main only |

*Presets vary — matrix reflects implementation gates, not assumed role names.*

---

## Section 23 — Route Matrix (Key Routes)

| Route | App | Permission | Scope/RLS | Data source | Equivalent | Known issue |
|-------|-----|------------|-----------|-------------|------------|-------------|
| `/projects/new` | Main | `projects.create` | — | `launchProject` | `/employee/projects/new` | Team stub |
| `/employee/projects/new` | Employee | `projects.create` grant | — | `launchProject` blank | Main | No templates |
| `/work` | Main | `tasks.read` | accessible tasks | UWM | `/employee/tasks` | — |
| `/work/calendar` | Main | `tasks.read` | — | UWM | — | **#441** |
| `/work/timeline` | Main | `tasks.read` | — | UWM | — | **#441** |
| `/projects/[id]?tab=documents` | Main | `documents.read` + project | assert | provider API | `/employee/.../files` | Different planes |
| `/employee/projects/[id]/files` | Employee | `documents.read` grant | scope + category | `document_links` | Owner browser | Often empty |
| `/company-files?tab=cloud` | Main | `documents.read` | — | provider API | — | Not registry |
| `/documents` | Main | `documents.read` | project filter | `documents` table | — | — |
| `/expenses` | Main | `expenses.read` | RLS project | `expenses` | `/employee/expenses` | Silent RLS subset |
| `/settings/storage` | Main | settings section | — | connections | — | Shows CONNECTED independent of registry |
| `/settings/people` | Main | people manage | — | access mode + grants | — | — |
| `?tab=team` | Main | `workforce.manage` read | project | assignments | — | — |
| `/employee/login` | Employee | — | — | PIN auth | — | — |

---

## Section 24 — Source-of-Truth Matrix

| Concept | Canonical source | Conflicts? |
|---------|------------------|------------|
| Organization | `organizations` | — |
| Person (auth) | `auth.users` + `profiles` | — |
| Org membership | `organization_memberships` | — |
| Employee | `employees` | Linked to user optionally |
| Employee App login | `employee_app_accounts` | Separate from membership |
| Permission (Main) | `role_permissions` via assignments | vs employee grants |
| Permission (Employee) | `employee_permission_grants` | Replaces role set in context |
| Scope | `employee_permission_grants.scope` | Main has no scope column |
| Project access mode | `organization_settings.project_access_mode` | — |
| Project access (user) | `project_access_grants` + assignments + mode | Multiple paths by design |
| Client | `clients` | — |
| Project | `projects` | — |
| Project team (roster) | `employee_project_assignments` | vs access grants (different purpose) |
| Project participants (assignee pool) | `listEffectiveProjectParticipants()` derived | Merges assignments + grants + mode all |
| Workspace | `workspaces` + `project_workspace_links` | — |
| Board | `boards` | Employee board is **synthetic** (not this table) |
| Task | `tasks` | — |
| Task assignee | `task_assignees` | Not owner_* columns |
| Meeting | `meeting_records` | — |
| Document metadata | `documents` | vs live provider listing |
| External file | Provider API + `storage_files` bridge | Not auto-synced |
| Expense | `expenses` | — |
| Time | `time_entries` | — |
| Contract/CCV | project contracts module | — |
| Billing | `billing_records` | — |
| Payment/Collection | payments module | — |
| Profitability | `compose-project-financials.ts` | Single compose — **FULL** |

**Conflicts flagged:**
- Live storage browser vs `documents` registry
- Employee synthetic board vs UWM `boards`
- Main RBAC vs Employee grants (parallel systems)
- Legacy עבודה vs UWM (intentional, not duplicate)

---

## Section 25 — Duplication / Disconnected Systems

| Area | Issue |
|------|-------|
| **Two permission systems** | RBAC roles vs employee_permission_grants |
| **Two project file views** | Provider browser vs document registry |
| **Two board models** | UWM buckets vs employee status columns |
| **Two template systems** | Structure catalog vs UWM DB templates (orchestrated, not merged tables) |
| **Legacy עבודה vs UWM** | Intentional parallel construction vs operational task layer |
| **Identity resolution** | org_member vs employee for same human |
| **RLS vs app scope** | Employee grants honored in app; `has_org_permission` SQL does not |
| **Project access algorithms** | Mostly aligned; expenses rely on RLS-only filtering |
| **Category on link.label vs documents.category** | Upload sets label; employee gate reads category column |

---

## Section 26 — Gap Prioritization

### P0 — Blocks normal system use / data access

| ID | Finding |
|----|---------|
| P0-1 | Calendar/Timeline **BROKEN** (React #441) on all `TaskWorkSurfaceClient` render-prop pages |
| P0-2 | Employee Project Files **empty** while Owner sees Drive folders — architectural data-plane disconnect + category gate |
| P0-3 | `documents.category` null on upload → employee category filter drops **all** docs silently |
| P0-4 | Permission granted (`documents.read`) but effective access fails due to scope/category — no user-visible explanation |

### P1 — Major broken workflow

| ID | Finding |
|----|---------|
| P1-1 | Project team selection at create is **STUB** — team only post-create |
| P1-2 | Employee has no cloud browser — cannot see same files as Owner even with grants |
| P1-3 | Expense org list silently RLS-subsetted — manager thinks org has no expenses |
| P1-4 | Org-wide meetings require `meetings.manage` to read at RLS |
| P1-5 | Employee task attachments UI **MISSING** |
| P1-6 | `project_financials.read` without `expenses.read` — confusing partial financial tab |

### P2 — Important incomplete product flow

| ID | Finding |
|----|---------|
| P2-1 | Employee project create lacks template launch modes |
| P2-2 | Employee calendar route orphaned (not in hub nav) |
| P2-3 | Employee timeline **MISSING** |
| P2-4 | Task reminders/recurrence UI without reliable delivery cron |
| P2-5 | Fragmented org setup — no guided first-run |
| P2-6 | Pre-existing Drive files never enter registry without manual upload/link |

### P3 — UX inconsistency / polish

| ID | Finding |
|----|---------|
| P3-1 | Employee board ≠ Owner UWM board (confusing but documented) |
| P3-2 | Employee expense list has no detail page |
| P3-3 | Employee project files list-only (no download actions) |
| P3-4 | Owner/Employee surface split enforced by redirect, not unified UX |

---

## Section 27 — Facts, Causes, Gaps, Dependencies (No Fix Design)

### Workstream groupings (for future approval only)

| Workstream | Depends on | Facts |
|------------|------------|-------|
| **UWM Calendar/Timeline fix** | None | #441 render-prop RSC pattern |
| **Document visibility unification** | Category model decision | Registry vs browser; category population on upload |
| **Employee file access** | Document workstream | Category grants + download UI + optional browser read-only |
| **Project create team** | None | Stub → wire to `addProjectTeamMember` |
| **Permission UX clarity** | None | Surface when RLS/scope filters results |
| **Expense visibility** | Project access clarity | RLS-only list behavior |

---

## Appendix — Key File Index

| Domain | Path |
|--------|------|
| Permissions catalog | `src/shared/permissions/catalog.ts` |
| Scopes | `src/shared/permissions/scopes.ts` |
| Project access | `src/modules/projects/application/project-access.ts` |
| Employee project scope | `src/modules/employee-app/application/project-scope.ts` |
| Project participants | `src/modules/projects/application/project-participants.ts` |
| Launch project | `src/modules/projects/application/launch-project.ts` |
| Document access (employee) | `src/modules/employee-app/application/document-access.ts` |
| Employee project files | `src/modules/employee-app/application/employee-project-documents.ts` |
| Storage browser (project) | `src/modules/external-storage/application/browser-service.ts` |
| Storage browser (org) | `src/modules/external-storage/application/org-browser-service.ts` |
| Task work surface | `src/modules/tasks/ui/task-work-surface-client.tsx` |
| SQL can_access_project | `drizzle/migrations/0050_wave3_operations.sql` |
| Financial compose | `src/modules/financials/application/compose-project-financials.ts` |

---

*End of read-only system map. No code, DB, or data changes made.*
