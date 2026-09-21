# ProjectFlow — Employee App Full Architecture & Root-Cause Audit

**Date:** 2026-09-21  
**Mode:** READ-ONLY (no code changes, no SQL execution, no DB mutation, no commit/push/deploy)  
**Scope:** Authorization model, Tasks/Team mismatch, finance/office exposure, permission config UX, target model (report only)

---

## EMPLOYEE APP FULL AUDIT = COMPLETE

---

## Executive verdict

Employee App is a **second authorization plane** (`employee_permission_grants` + scopes) that **replaces** Main App RBAC in `OrgContext` for users with the `employee` role and an active `employee_app_accounts` link. It is **not** a field-worker-only product in intent, but **today’s surfaces are ops-narrow**: home, time, projects/tasks, team, meetings, documents, forms, expenses.

**Tasks page showing 0 while Team shows 10/18/17 is not one shared-count bug.** Team and Tasks use **different permissions, different queries, and different semantics**. Finance/office areas are largely **absent as Employee App routes** (not merely hidden nav), and most money-table RLS still keys off **org-role** permissions via `has_org_permission`, so even grantable keys often cannot work end-to-end for a pure Employee App session.

Active Employee App sessions are **redirected away from Main App** (`assertOwnerAppSurface` → `/employee`), so granting finance permissions without Employee routes does not unlock Main `/billing` for that session.

---

## 1. Authorization model end-to-end

### Path A — Main App / Organization RBAC

```
auth user
  → organization_memberships (active)
  → role_assignments → roles.key (+ roleKeys[])
  → role_permissions.permission_key
  → loadEffectivePermissions() → context.permissions
```

- **No scope column** on org RBAC.
- Project visibility: `project_access_mode` + `project_access_grants` + `projects.access_all` + assignments (`app.can_access_project`).
- SQL: `app.has_org_permission` (`drizzle/migrations/0006_rls_hardening.sql`).

### Path B — Employee App grants

```
role key "employee" present
  → employee_app_accounts (user ↔ employee, status)
  → employee_permission_grants (permission_key, scope, granted)
  → employee_document_category_grants (optional)
  → loadEmployeeAppContextForUser()
  → enrichOrgContextWithEmployeeApp() REPLACES context.permissions
  → context.employeeApp.grants kept for scope lookup
```

**Effective permissions** (`enrich-context.ts`):

- Baseline always: `attendance.self`
- Plus every grant with `granted: true`
- **Owner/Manager role_permissions are discarded** from `context.permissions` for this session

**Scope lookup** (`employeePermissionScope`): reads `employeeApp.grants`, not the binary Set.  
**`employeeHasPermission`**: binary `context.permissions.has` — **scope-blind**.

### Central gates

| Helper | Reads |
|--------|--------|
| `authorize()` | Same enriched Set; project resource → employee scope via `assertEmployeeProjectScope`; document → employee doc access |
| `employeeHasPermission` / `employeePermissionScope` | Employee grants plane |
| `hasPermission` / `assertPermission` | Same Set post-enrich (Main helpers) |
| `app.has_org_permission` | Org roles only |
| `app.employee_permission_scope` / `has_employee_permission` | Grant rows for linked employee |
| `app.uwm_has_permission` | **org OR employee** |
| Task RLS `uwm_can_read_task` | Org `tasks.read`/`manage_all` **first**, else employee scoped grant |

### Independence answers

| Question | Answer |
|----------|--------|
| Are Employee App permissions independent from Main App RBAC? | **Yes at app layer** after enrich. |
| Do Owner org-role permissions unlock Employee App? | **No at app layer.** Partially at RLS if the same user still has Owner role (`has_org_permission` still true). |
| Can app authorize pass while RLS fails? | **Yes** — especially expenses/billing/AP still on `has_org_permission` only (`0073`). |
| Can RLS pass while app denies? | **Yes** — dual-role user: app replaces permissions; RLS may still allow via org role. |

### Where scope is lost / remapped

1. `authorize({ scope })` **without** `resource` — scope argument unused.
2. `employeeHasPermission` never consults scope.
3. Many call sites default missing scope to `assigned_only` (not deny).
4. App `granted_projects` vs SQL task helper: non-`all_organization`/`self_only` collapses to **assignment check** in `uwm_employee_scope_allows_task`.
5. Owner’s `projects.access_all` does **not** carry into Employee session Set unless granted as an employee grant (and it is **not** in the editor).

---

## 2. Permission scopes (actual behavior)

Enum: `self_only` | `assigned_only` | `granted_projects` | `all_organization`

| Scope | Actual meaning today |
|-------|----------------------|
| `self_only` | Own person/rows (e.g. assignee on tasks; own attendance/time). |
| `assigned_only` | Active `employee_project_assignments` (date-bounded). |
| `granted_projects` | Main-style `listAccessibleProjectIdsForUser` / `project_access_grants`. |
| `all_organization` | App: no project filter for that permission. RLS may still impose workspace/project gates. |

### Key permissions (what scope actually does)

| Permission | Editor? | Scope behavior |
|------------|---------|----------------|
| `tasks.read` | Y | self → assignee join; assigned/granted → project IDs; all → no app filter (limit 500). RLS always requires workspace content access first. |
| `tasks.create` / `assign` / `manage_all` | Y | Project must be in create/mutation scope; manage_all can substitute for some mutations. |
| `tasks.update` | Y | self = must be assignee. |
| `projects.read` | Y | Filters Employee project list via project-scope resolver. |
| `projects.create` | Y | all only; create form. |
| `projects.update` / `projects.access_all` | N | Catalog/Main; access_all not grantable in Employee editor. |
| `project_financials.read` | Y | **Grantable but no Employee consumer/route.** |
| `project_profit.read` | N | Main only. |
| `clients.read` / `manage` | Y | Create-project picker only — no clients hub. |
| `contracts.manage` | Y | Finance fields on project create only. |
| `contracts.read` / `billing.*` | N | Not in editor (billing.manage checked in create UI but not grantable). |
| `expenses.read` / `create` | Y | App project filter; **RLS still org-role only** → high fail risk. |
| `ap.*` / `vendors.*` / `procurement.*` / `banking.*` | N | No Employee surface; RLS org-role. |
| `workforce.read` | Y | Roster filtered by shared assignments unless all_org. |
| `documents.read` / `manage` | Y | Category grants + project scope; storage SELECT uses `uwm_has_permission`. |

---

## TASKS PAGE SOURCE =

`src/app/[locale]/employee/(shell)/tasks/page.tsx`  
→ `buildEmployeeTaskListPayload`  
→ `listEmployeePmTasks` / `queryEmployeePmTaskRows`  
→ gated by **`tasks.read` scope** (`employeePermissionScope`)  
→ client: `EmployeeTaskListView` → `parseTaskFilterState` → `filterEmployeeTasks`

Also: Field Items tab uses `listEmployeeAssignedTasks` under `field_ops.read` / `service.read` (separate punch list).

## TEAM COUNT SOURCE =

`src/app/[locale]/employee/(shell)/team/page.tsx`  
→ `listEmployeeTeamRoster`  
→ gated by **`workforce.read` only**  
→ open count = `task_assignees ⋈ tasks` where assignee ∈ roster, `archived_at IS NULL`, status ∉ `{done,cancelled}`  
→ **no `tasks.project_id` filter on the count**  
→ badge only (name, title, `openTaskCount`) — **no drilldown**

## TASK COUNT MISMATCH ROOT CAUSE =

**Different permissions + different queries + different semantics (by design today), amplified by UX.**

1. Team answers: “How many open **assignments** does each roster member have that RLS lets me see?” (`workforce.read`).
2. Tasks answers: “Which task **rows** does my **`tasks.read` grant + client filters** return?”
3. Team counts are **assignee-centric** and **not limited to shared projects** once a person is on the roster.
4. Tasks under `self_only` or client `scope=mine` only shows the **viewer’s** assignments → can be **0** while teammates show 10/18/17.
5. Under `assigned_only`, Tasks only includes `tasks.project_id IN` assigned projects (`null` project_id **excluded**); Team still counts those assignees’ other open work if RLS-visible.
6. Secondary: dual-identity RLS may allow Team to count via org `tasks.read` while app Task list uses only employee grants; Home summary further drops undated open tasks.

**Not** “Team and Tasks share one broken counter.”

## FILTER ROOT CAUSE =

**Distinguish:**

| Evidence | Cause |
|----------|--------|
| Empty copy `emptyPmTasks` | **DATA QUERY ZERO** — server list `[]` (no/missing grant, scope mode, or RLS emptied rows) |
| Empty copy `emptyTasksDetailed` with `tasks.length > 0` | **CLIENT FILTER** removed rows |

**Client filter behavior** (`employee-filter-logic.ts`):

- Defaults: `canFilterByAssignee` (`readScope !== 'self_only'`) → default `scope=company`, `status=open`
- `self_only` → default `scope=mine`
- `scope=mine` keeps only `assigneeEmployeeIds.includes(currentEmployeeId)`
- `canSeeCompanyScope` (Mine/Company bar) only when `readScope === 'all_organization'`
- Sticky URL `?scope=mine` can force Mine even for all_org users

**Most likely UX mismatch for reported screenshots:** Team advertises **other people’s** open work; Tasks is on **Mine** (`self_only` grant, sticky URL, or field-items tab with 0 punch tasks) → **0**.

---

## OWNER ALL-COMPANY TASK ACCESS CURRENTLY =

**PARTIAL / NOT END-TO-END**

## WHY =

Even with `tasks.read = all_organization`:

| Layer | Behavior |
|-------|----------|
| App list | Org + non-archived, no assignee/project filter (limit 500) |
| Client | Default `company`; Mine still hides others if selected |
| RLS `uwm_can_read_task` | Always requires `uwm_has_workspace_content_access` **before** scope; `all_organization` only inside employee scope helper |
| Restricted workspaces | Employee still blocked without workspace membership (integration proven pattern) |
| `project_id IS NULL` | Included under all_org app mode; excluded under assigned_only |
| Detail / mutations | Separate grants; assignee display loads after list |
| Nav | Tasks needs employee `tasks.read` (or field/service/planning); Team needs `workforce.read` |
| Preset gap | `office_admin` grants `tasks.read=self_only` — office users do **not** get company tasks by preset |

---

## TEAM DRILLDOWN CURRENTLY =

**NONE.** UI is static list + open-task badge only (`team/page.tsx`). No click, no href, no status breakdown.

## CAN REUSE CANONICAL TASK MODULE =

**YES — no second task system needed.**

Simplest reuse path (report only, not built):

```
/employee/tasks?assignee=<employeeId>&scope=company&status=open
```

`parseTaskFilterState` already reads `assignee`, `scope`, `status`, priority, due filters. Reuses `EmployeeTaskListView` + existing payload. Works when payload already contains that assignee’s tasks (`all_organization`, or overlapping `assigned_only` projects). Optional status chips (overdue / due today / blocked / in progress / completed) map to existing `status` + `time` params.

---

## CURRENT EMPLOYEE NAV =

From `buildEmployeeNavItems()` (`get-employee-shell.ts`):

| href | Gate |
|------|------|
| `/employee` | Always |
| `/employee/time` | attendance.self OR time.manage OR attendance.read/manage OR time.approve |
| `/employee/projects` | projects.read |
| `/employee/tasks` | tasks.read OR tasks.create OR field_ops.read OR service.read OR planning.read |
| `/employee/team` | workforce.read OR attendance.read/manage |
| `/employee/meetings` | meetings.read |
| `/employee/documents` | documents.read |
| `/employee/forms` | forms.read OR forms.submit |
| `/employee/expenses` | expenses.read OR expenses.create |

**Not in nav (pages may exist):** hours, attendance history, project create, project hub children.

**Never in Employee nav:** billing, clients hub, contracts hub, AP, vendors, procurement, banking, project financials, collections, quotes, changes.

---

## FINANCE PERMISSIONS EXIST =

**YES** in catalog (`billing.*`, `ap.*`, `vendors.*`, `procurement.*`, `banking.*`, `project_financials.read`, `project_profit.read`, `clients.*`, `contracts.*`, `expenses.*`).

## FINANCE EMPLOYEE ROUTES EXIST =

**NO** for billing/collections/AP/vendors/procurement/banking/clients hub/contracts hub/project financials.  
**YES** only for `/employee/expenses` (+ create) and partial finance fields on `/employee/projects/new`.

## FINANCE EMPLOYEE NAV EXISTS =

**NO** (except Expenses).

---

### Domain matrix (condensed)

| Domain | Perm exists | Main route | EA route | EA grant UX | RLS honors employee grant | EA read | EA write | Gap |
|--------|:-----------:|:----------:|:--------:|:-----------:|:-------------------------:|:-------:|:--------:|-----|
| PROJECTS | Y | Y | Y | Y (read/create) | P (can_access_project) | Y | create Y | RLS mode≠all without access_all |
| CLIENTS | Y | Y | N (picker only) | Y | P | P | P | **Missing hub UI** |
| CONTRACTS | Y | Y | N | P (manage only) | N | P create | P | **Missing hub** |
| CHANGES / QUOTES | Y | Y | N | N | N | N | N | Missing all EA |
| BILLING | Y | Y | N | N | N (`0073` org only) | N | N | Missing all EA + RLS |
| COLLECTIONS | Y | Y | N | N | N | N | N | Missing all EA + RLS |
| PROJECT FINANCIALS | Y | Y | N | **Y but unused** | N | N | N | **Grant with no consumer** |
| PROFITABILITY | Y | Y | N | N | N | N | N | Missing all EA |
| EXPENSES | Y | Y | Y | Y | **N** | P UI | P UI | **RLS gap** |
| AP | Y | Y | N | N | N | N | N | Missing all EA |
| VENDORS | Y | Y | N | N | N | N | N | Missing all EA |
| PROCUREMENT | Y | Y | N | N | N | N | N | Missing all EA |
| BANKING | Y | Y | N | N | N | N | N | Missing all EA |
| WORKFORCE / TEAM | Y | Y | Y team | Y read | P | Y roster | N | No drilldown |
| DOCUMENTS | Y | Y | Y | Y | Y (uwm) | Y | P | OK path |
| TASKS | Y | Y | Y | Y | Y (uwm helpers) | Y | Y if grants | Scope/filter mismatches |

---

## BILLING =

No Employee route/nav/editor grant. Main App only. Employee sessions redirected off Main App. Office Manager **cannot** run billing from Employee App today.

## COLLECTIONS =

Same as billing (`billing.read` / `billing.manage` + Main `/billing/payments`). **Impossible** in Employee App session today.

## PROJECT FINANCIALS =

`project_financials.read` **grantable** in editor; **zero Employee App consumer** (no hub tab, no service call, no nav). Project hub links: tasks, board, time, files, meetings only.

## EXPENSES =

Employee list + create exist and are grantable. **RLS still `has_org_permission`** → pure Employee grants can authorize in app then get empty/denied at DB.

## AP =

No Employee surface. Org RLS. Main `/procurement/ap` only.

## VENDORS =

No Employee surface.

## PROCUREMENT =

No Employee surface.

## BANKING =

No Employee surface. Main settings only.

---

## PROJECT ACCESS MODEL CURRENT =

| Mechanism | Behavior |
|-----------|----------|
| `projects.read` + scope | App filters via assignments / granted_projects / all_organization |
| `projects.access_all` | Not in Employee editor; Owner’s role copy does not apply after enrich |
| Assignments | Primary for PM / assigned_only presets |
| EA project detail | Ops hub only — **no financials** |
| Management `all_organization` | App lists all; RLS `can_access_project` may still hide projects when org mode ≠ `all` unless grants/assignments/access_all |
| PM assigned_only | Sees assigned projects only — intentional |

## TASK ACCESS MODEL CURRENT =

| Layer | Gate |
|-------|------|
| App list | `tasks.read` scope → self / projects / all |
| Client | Mine vs Company; status/time/assignee/project |
| RLS | Workspace content access + org OR employee task permission |
| Team counts | `workforce.read` + assignee open status — **not** `tasks.read` |

---

## ORG RBAC VS EMPLOYEE GRANTS =

- **App:** Employee plane **replaces** Main permissions for Employee App users.
- **RLS:** Mixed — tasks/docs often dual-path (`uwm_has_permission` / task helpers); finance mostly **org-role only**.
- **Session wall:** Active Employee App cannot use Main App UI even if org roles would allow it.

## RLS COMPATIBILITY =

| Area | Compatible with employee grants? |
|------|----------------------------------|
| Tasks / UWM | Mostly yes (with workspace gate) |
| Documents / storage | Yes after 0121+ |
| Meetings | Dual-path in later migrations |
| Expenses / billing / AP / banking | **No** — `has_org_permission` only |
| Projects SELECT | `can_access_project` — assignment path partial via UWM helpers on some paths only |

## KNOWN MISMATCHES =

1. Team counts vs Tasks list (permissions + query + filters).
2. App `all_organization` tasks vs RLS workspace gate.
3. App `granted_projects` vs SQL assignment collapse for tasks.
4. Expenses app authorize vs org-only RLS.
5. `project_financials.read` grantable with no EA UI.
6. `billing.manage` referenced on project create but not in editor.
7. Office preset = self-only tasks + expenses — not office finance console.
8. Employee sessions blocked from Main App finance even when org roles exist.
9. Team open counts not scoped to shared projects.
10. `authorize(scope)` unused without resource.

---

## CURRENT PERMISSION CONFIG UI =

- **Where:** Main App → Workforce → Employee detail → `employee-app-access-panel.tsx`
- **Actions:** `employee-app-actions.ts` → `saveEmployeeAppGrants` (requires Main `workforce.manage`)
- **Controls:** Individual toggles + scope select per `EMPLOYEE_PERMISSION_EDITOR_GROUPS`; document category allowlist; activate/suspend; apply preset
- **Effect:** Persists to `employee_permission_grants`; next request enrich reloads — **immediate for new requests**
- **Conflict:** Main role and Employee grants do not merge in app Set; RLS may still see Main roles

## PRESETS CURRENTLY =

`field_worker`, `field_worker_time`, `technical_professional`, `professional_employee`, `foreman`, `team_lead`, `project_manager`, `office_admin`/`office`, `management`, `read_only_project`, `external_consultant`, `supervisor_inspector`, `custom`

Notable preset gaps vs Owner intent:

| Preset | Gap |
|--------|-----|
| `office_admin` | expenses + forms + docs + **tasks.self_only** — no projects/clients/billing/team/company tasks |
| `management` | strong ops (projects/tasks/workforce/docs/meetings) — **no expenses, clients, contracts, billing, financials** |
| `project_manager` | assigned ops — no financials |
| No secretary-specific preset | — |

---

## OWNER / MANAGEMENT SUPPORT =

**Partial.** Management preset gives broad **ops** visibility (projects/tasks/team). Does **not** deliver finance/office console. Owner using Employee App still blocked from Main App; must rely on Employee grants only.

## OFFICE MANAGER SUPPORT =

**Weak for intended role.** Office preset ≠ office manager. No billing/collections/AP/clients hub. Expenses grant may fail RLS. Company tasks not included by default.

## SECRETARY SUPPORT =

**Configurable only via custom grants**, and even then most finance/clients surfaces **do not exist** in Employee App. Subset of office ops possible (forms, docs, expenses UI).

## PROJECT MANAGER SUPPORT =

**Strong for field/ops** on assigned projects (tasks, docs, meetings, workforce.read assigned). **No** project financials in EA hub. Matches assigned-only model.

## FIELD EMPLOYEE SUPPORT =

**Strong for intended narrow scope** (attendance, self/assigned tasks, limited docs). Matches product for pure field workers.

---

## MISSING EMPLOYEE APP SURFACES =

- Clients hub  
- Contracts hub  
- Billing + collections/payments  
- Project financials / profitability tabs  
- AP / vendor bills  
- Vendors  
- Procurement  
- Banking  
- Team → task drilldown  
- Quotes / changes  

## MISSING PERMISSION CONNECTIONS =

- `project_financials.read` grant → no EA consumer  
- `billing.*` / `ap.*` / `vendors.*` / `procurement.*` / `banking.*` / `project_profit.read` not in editor  
- `contracts.read` not in editor  
- `projects.access_all` not grantable for true all-project RLS bypass  
- Nav does not surface many grantable keys (clients, financials)

## MISSING RLS CONNECTIONS =

- Expenses / billing / AP / banking policies still `has_org_permission` only  
- Projects SELECT may not honor `projects.read=all_organization` when org access mode ≠ `all`  
- Task RLS workspace gate blocks literal “all org tasks”

## MISSING DRILLDOWNS =

- Team member → filtered canonical task list  
- Team open count → overdue / due today / blocked / in progress / completed breakdown  

---

## PROPOSED SIMPLE TARGET MODEL =

**(Report only — do not implement.)**

Principles:

1. **One canonical system** — same tasks, projects, billing, expenses entities; Employee App is a permission-gated surface, not a duplicate datastore.
2. **Permissions + scopes control access** — job title never hardcodes authorization; presets are convenience only.
3. **Main App** remains full Owner/admin (org setup, RBAC templates, banking settings, month-close, dangerous admin).
4. **Employee App** exposes **delegated operational work** when granted.
5. Align **app authorize + RLS** on `uwm_has_permission` / employee scope for every Employee-exposed money/ops table.
6. Reuse existing modules (Tasks list filters, Main finance services) behind Employee routes — no second finance engine.

### Suggested presets (customize afterward)

| Preset | Convenience grants (conceptual) |
|--------|----------------------------------|
| **Owner / Management** | `all_organization` on projects, tasks (read/create/assign/manage), workforce, documents, meetings, expenses, clients, contracts, billing, project_financials; optional AP/vendors |
| **Office Manager** | projects all; clients; contracts; billing + collections; expenses; AP/vendors as needed; documents; company tasks + team; optional attendance.read |
| **Secretary** | subset of office (clients read, billing read or manage, docs, forms, expenses) — Owner customizes |
| **Project Manager** | assigned projects; tasks manage on assigned; docs; meetings; workforce.read assigned; optional limited `project_financials.read` assigned |
| **Field Employee** | attendance; tasks self/assigned; docs/forms as granted |

Owner must still flip individual keys/scopes after applying a preset.

### Main vs Employee placement

| Belongs mainly in Main App | Can/should be in Employee App when granted |
|----------------------------|--------------------------------------------|
| Org setup, roles, settings, banking config, month-close, dangerous admin, full reporting studio | Projects ops, tasks/team, docs/forms, time/attendance, expenses entry, and (when built) clients/contracts/billing/collections/AP as delegated office work |
| Same canonical services | Same services, scoped UI |

---

## SQL NEEDED FOR DIAGNOSIS =

**YES** — to prove live grants/scopes for the screenshot user (employee ID, `tasks.read` scope, `workforce.read`, finance grants). Prepared below; **not executed**.

## PREPARED READ-ONLY SELECTS =

Replace `:org_id`, `:user_id`, `:employee_id` after identifying the session user.

```sql
-- 1) Employee App account + all grants/scopes
SELECT
  eaa.id AS account_id,
  eaa.status,
  eaa.user_id,
  eaa.employee_id,
  e.name AS employee_name,
  epg.permission_key,
  epg.scope,
  epg.granted
FROM employee_app_accounts eaa
JOIN employees e
  ON e.id = eaa.employee_id
 AND e.organization_id = eaa.organization_id
LEFT JOIN employee_permission_grants epg
  ON epg.organization_id = eaa.organization_id
 AND epg.employee_id = eaa.employee_id
WHERE eaa.organization_id = :org_id
  AND (eaa.user_id = :user_id OR eaa.employee_id = :employee_id)
ORDER BY epg.permission_key;

-- 2) Focus: tasks / workforce / projects / finance grants
SELECT permission_key, scope, granted
FROM employee_permission_grants
WHERE organization_id = :org_id
  AND employee_id = :employee_id
  AND permission_key IN (
    'tasks.read', 'tasks.create', 'tasks.update', 'tasks.assign', 'tasks.manage_all',
    'workforce.read',
    'projects.read', 'projects.create', 'projects.access_all',
    'project_financials.read', 'project_profit.read',
    'clients.read', 'clients.manage',
    'contracts.read', 'contracts.manage',
    'billing.read', 'billing.manage',
    'expenses.read', 'expenses.create',
    'ap.read', 'ap.manage',
    'vendors.read', 'vendors.manage',
    'banking.read', 'banking.manage'
  )
ORDER BY permission_key;

-- 3) Org roles still attached (RLS may still see these)
SELECT r.key AS role_key, rp.permission_key
FROM role_assignments ra
JOIN roles r ON r.id = ra.role_id
LEFT JOIN role_permissions rp ON rp.role_id = ra.role_id
WHERE ra.organization_id = :org_id
  AND ra.user_id = :user_id
ORDER BY 1, 2;

-- 4) Open assignment counts per employee (Team-like) vs viewer assignee rows (Tasks-mine-like)
SELECT e.id, e.name,
       COUNT(*) FILTER (
         WHERE t.archived_at IS NULL
           AND t.status NOT IN ('done', 'cancelled')
       ) AS open_assigned_tasks
FROM employees e
LEFT JOIN task_assignees ta
  ON ta.employee_id = e.id
 AND ta.organization_id = e.organization_id
LEFT JOIN tasks t ON t.id = ta.task_id
WHERE e.organization_id = :org_id
  AND e.status = 'active'
GROUP BY e.id, e.name
ORDER BY open_assigned_tasks DESC;

SELECT COUNT(*) AS my_open_assigned
FROM task_assignees ta
JOIN tasks t ON t.id = ta.task_id
WHERE ta.organization_id = :org_id
  AND ta.employee_id = :employee_id
  AND t.archived_at IS NULL
  AND t.status NOT IN ('done', 'cancelled');

-- 5) Active project assignments for scope diagnosis
SELECT epa.project_id, p.name, epa.status, epa.start_date, epa.end_date
FROM employee_project_assignments epa
JOIN projects p ON p.id = epa.project_id
WHERE epa.organization_id = :org_id
  AND epa.employee_id = :employee_id
ORDER BY p.name;
```

---

## CODE CHANGED = NO

## SQL EXECUTED = NO

## DB MUTATED = NO

## COMMIT = NO

## PUSH = NO

## DEPLOY = NO

---

## Key file index

| Concern | Path |
|---------|------|
| Enrich / replace permissions | `src/modules/employee-app/application/enrich-context.ts` |
| Scope helpers | `src/modules/employee-app/application/load-employee-app-context.ts` |
| Authorize | `src/shared/permissions/authorize.ts` |
| Project scope | `src/modules/employee-app/application/project-scope.ts` |
| PM tasks query | `src/modules/employee-app/application/employee-pm-tasks.ts` |
| Task list payload | `src/modules/employee-app/application/build-employee-task-list-payload.ts` |
| Filters | `src/modules/employee-app/ui/employee-filter-logic.ts` |
| Team roster | `src/modules/employee-app/application/employee-operational.ts` |
| Nav | `src/modules/employee-app/application/get-employee-shell.ts` |
| Editor groups | `src/modules/employee-app/application/permission-editor.ts` |
| Presets | `src/modules/employee-app/application/presets.ts` |
| Session wall | `src/modules/employee-app/application/session-guard.ts` |
| Project hub | `src/modules/employee-app/ui/employee-project-hub-nav.tsx` |
| Task RLS | `drizzle/migrations/0100_uwm_tasks_core.sql` |
| Dual permission SQL | `drizzle/migrations/0097_uwm_workspaces.sql` |
| Financial RLS (org only) | `drizzle/migrations/0073_financial_rls_permission_gates.sql` |

---

**STOP.**
