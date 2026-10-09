---
name: Planner+ & Multi-Industry Master
overview: "OWNER APPROVED — Build @ 2f13eec6. Release train 3138c1fa deployed; closeout delta (My Work access, Related work labels, entity follow-up tasks) staged locally awaiting Owner report approval."
todos:
  - id: wp-int-contracts
    content: "INT (Lead): work/layout, work-search-params, WORK_TASK_QUERY_KEYS, my-work-views.ts — merge gate"
    status: completed
  - id: wp-c-scale-backend
    content: "WP-C: JOIN assigned_to_me/following; filter-before-LIMIT; accessibleWorkspaceIds once; prepare 0177 SQL + journal (NO Production apply)"
    status: completed
  - id: wp-a-lazy-my-work
    content: "WP-A: Lazy My Work; searchParams.view; org TZ; completed 30d; upcoming default 14d + URL date filters"
    status: completed
  - id: wp-b-filters-saved-views
    content: "WP-B: tasks in SAVED_LIST_KEYS; URL filters + clientId; SavedListViewsBar on board/calendar/timeline"
    status: completed
  - id: wp-a-access-parity
    content: "WP-A+F: Project+workspace access on my-work + listAccessibleTasks (match insights)"
    status: completed
  - id: wp-e-dedupe-planning
    content: "WP-E: Drizzle taskId; dedupeCommandCenterItems; calendar C1/C2; schedule link UI; Related panel"
    status: completed
  - id: wp-d-profiles-fab
    content: "WP-D: Approved profiles + work_management additive; FAB task; GC create guidance (no auto developer_gc); template seeds"
    status: completed
  - id: wp-f-workload-reassign
    content: "WP-F: Real workload reassign via assign-task (addAssignee/removeAssignee); permissions; activity preserved"
    status: completed
  - id: wp-f-mobile-rtl-sec
    content: "WP-F: he-IL hub copy; mobile tabs; SEC-004 route audit; focused tests; release preflight"
    status: completed
  - id: release-coordinated
    content: "Lead: delta commit after Owner approves Hebrew final report; CI + Vercel + smoke; 0177 stop block until Owner SQL OK"
    status: completed
isProject: true
---

# ProjectFlow — Planner+ & Multi-Industry (canonical master)

**Status:** **IMPLEMENTATION COMPLETE (code)** — **Release train 1** pushed as `3138c1fa`; **closeout delta** local (not committed). Await Owner approval on Hebrew final report before second push.  
**Authority:** This file overrides all annex plans where they conflict.  
**Baseline code:** `2f13eec6`  
**Annexes (supporting only):** [work_hub_planner_plus_wave1](work_hub_planner_plus_wave1.plan.md) · [work_hub_saved_views_filters](work_hub_saved_views_filters.plan.md) · [tasks_uwm_scale_pagination](tasks_uwm_scale_pagination.plan.md) · [multi_industry_profiles_nav](multi_industry_profiles_nav.plan.md) · [task_integration_planning_calendar](task_integration_planning_calendar.plan.md) · [planner_plus_release](planner_plus_release.plan.md)

**Evidence (no re-audit):** [Capability map](docs/audits/PROJECTFLOW-FINAL-SYSTEM-CAPABILITY-MAP-2026-10-09.md), [Task fit](docs/audits/PROJECTFLOW-PRODUCT-FIT-TASK-MANAGEMENT-2026-10-09.md), [Oct-9 complete master](.cursor/plans/complete_implementation_master.plan.md).

---

## Owner decisions — RESOLVED (5/5)

### Decision 1 — Upcoming tasks

**APPROVED:** Default **`upcoming` My Work view = 14 calendar days** from org “today” (replace `sevenDaysFromNow()` in [`my-work.repository.ts`](src/modules/tasks/data/my-work.repository.ts)).

**Also:** Preserve **Today**, **This Week**, **Overdue**, and other tab semantics. Support **URL/query date filters** on org lenses (`dueFrom` / `dueTo` in `WORK_TASK_QUERY_KEYS`) so users are not locked to 14 days when filtering board/calendar/timeline. Saved views may store arbitrary date ranges.

### Decision 2 — General contractors

**APPROVED:** **Smart project-creation defaults** and **in-app management-mode guidance** for `GENERAL_CONTRACTOR` (and related GC personas).

**Rules:**

- **Reuse** existing execution hubs and `requireDeveloperGcExecutionPage` — **no** second execution system, **no** duplicate project hubs.
- **Do not** automatically set `developer_gc` / grant Dev+GC privileges for ordinary contractors.
- **`developer_gc` execution** appears only when project **`management_mode`** is **explicitly** set and authorized (existing [`management-mode.ts`](src/modules/project-profile/domain/management-mode.ts) rules).
- **SEC-004** gates remain on all execution deep links; complete route audit in WP-F.
- **Rejected:** “Lite execution hub” that bypasses SEC-004 for `standard_project`.

### Decision 3 — Business profiles

**APPROVED:** Add **`work_management`** to **`visibleModules`** (additive apply only) for these exact `BusinessProfileKey` values in [`business-profiles.ts`](src/modules/tenancy/domain/business-profiles.ts):

| Profile keys |
|--------------|
| `GENERAL_CONTRACTOR`, `RENOVATION` |
| `ELECTRICAL`, `PLUMBING`, `HVAC`, `SMALL_WORKS` |
| `ARCHITECT`, `DESIGNER`, `ENGINEERING_CONSULTANT`, `PROJECT_MANAGEMENT` |

**Rules:** `moduleMode: 'additive'` only; **never** disable modules with data or `firstUsedAt`; **never** overwrite Owner module toggles. Persona nav may surface `/work` and `/portfolio` without enabling procurement/boq/etc. FAB **task** when `TASKS_CREATE` + module on.

### Decision 4 — Workload reassignment

**APPROVED:** **Real reassignment** from [`/workload`](src/app/[locale]/(app)/workload/) — **not** a stub link.

**Implementation:** Reuse [`assign-task.ts`](src/modules/tasks/application/assign-task.ts) (`addAssignee` / `removeAssignee`) and existing permission checks (`tasks.assign` / task manage paths). Single mutation path; preserve **task activity**; refresh workload aggregates after assign; **no** duplicate notifications. Unauthorized users: control hidden or disabled.

### Decision 5 — Migration 0177

**APPROVED:** **Prepare and review** migration **0177** (indexes per [tasks_uwm_scale_pagination](tasks_uwm_scale_pagination.plan.md)).

**NOT APPROVED:** Applying **0177** to Production. Lead reports SQL, index list, EXPLAIN notes, journal check — **STOP** until Owner explicit apply approval.

---

## Production migration baseline (reconciled)

| Fact | Plan treatment |
|------|----------------|
| Release reports: migrations through **0176** applied | Treat **0174–0176 as applied** in planning; **do not** re-run or list them as “pending build work” |
| SEC-010 Production journal vs repo | **Unverified** unless Owner confirms — note only, no Production writes |
| **0177** | **New work** — PREPARED ONLY |
| **0110** `planning_work_items.task_id` | Assumed applied with UWM stack; Drizzle sync in WP-E (no re-apply 0110) |

Annex [planner_plus_release](planner_plus_release.plan.md) must **not** imply 0174 is outstanding for this release train unless Production drift is proven.

---

## Annex override policy

If an annex says:

| Stale annex instruction | Master override |
|-------------------------|-----------------|
| Workload reassign stub | **Real reassign** (Decision 4) |
| Upcoming 7 days / “Owner pick” | **14-day default** + URL date filters (Decision 1) |
| GC lite hub / bypass SEC-004 | **Guidance + explicit mode only** (Decision 2) |
| Optional trades without `work_management` | **Approved profile list** (Decision 3) |
| Apply 0177 in release | **PREPARED ONLY** (Decision 5) |
| `listKey=work` | **`listKey=tasks`** |

Annexes updated 2026-10-10 with banner pointing here.

---

## Parallel implementation (Build phase)

**Mandatory:** Launch **six implementation subagents** (Cursor Task / Auto or Composer) plus **Lead integrator**. Subagents **write code**; if Task delegation unavailable, Lead **reports** and stops — does not silently solo the entire release.

### Lead (INT + release)

**Owns (exclusive write):**

- `src/app/[locale]/(app)/work/layout.tsx`
- `src/app/[locale]/(app)/work/_lib/work-search-params.ts`
- `src/modules/tasks/domain/my-work-views.ts`
- `src/modules/tasks/domain/work-task-filter-keys.ts`
- Merge order for `tasks.repository.ts`, `my-work.repository.ts`, `work/page.tsx`
- `drizzle/migrations/0177_*` preparation + journal
- Final preflight, commit, push, CI monitor, Vercel SHA

### WP-A — Task UX (subagent)

**Scope:** Lazy My Work, `?view=`, TZ, upcoming 14d, completed 30d, mobile tab labels, access helper consumption.

**Files:** `work/page.tsx`, `work/actions.ts`, `my-work-view.tsx`, `my-work.ts`, `my-work.repository.ts`, `locales/*/tasks.json` (with WP-F for he-IL hub title).

**Avoid:** `tasks.repository.ts` core list SQL (WP-C), `business-profiles.ts` (WP-D).

### WP-B — Saved views & filters (subagent)

**Scope:** `SAVED_LIST_KEYS` + `tasks`; URL filter bar; server `clientId`; SavedListViewsBar on board/calendar/timeline; WorkHubNav.

**Files:** `tenancy/domain/saved-list-views.ts`, `tasks.repository.ts` (clientId join only — coordinate with WP-C), `work/board|calendar|timeline/page.tsx`, filter UI under `modules/tasks/ui/`.

### WP-C — Scale & pagination (subagent)

**Scope:** JOIN `assigned_to_me`/`following`; filter-before-LIMIT; hoist workspace IDs; **0177 SQL file** (no apply).

**Files:** `my-work.repository.ts`, `tasks.repository.ts`, `list-tasks.ts`, `drizzle/schema/tasks.ts`, `drizzle/migrations/0177_*`.

### WP-D — Business profiles (subagent)

**Scope:** Approved `visibleModules`; persona nav; FAB task; GC create copy/defaults; profile task template seeds.

**Files:** `business-profiles.ts`, `apply-business-profile.ts`, `experience-nav-layout.ts`, `quick-create*.tsx`, `project-create-form.tsx`, optional `profile-task-template-seeds.ts`.

### WP-E — Planning / calendar (subagent)

**Scope:** Drizzle `taskId`; dedupe D1/D3; calendar C1/C2; schedule link UI; Related work panel + entity_links entry points.

**Files:** `drizzle/schema/planning.ts`, `modules/planning/**`, `command-center/**`, `calendar/data/source-dates.repository.ts`, task detail panel, docs/product PM-005/PM-011.

### WP-F — Security, mobile, workload (subagent)

**Scope:** Workload **real** reassign; SEC-004 route audit; RBAC integration test; contractor regression slice; mobile/he-IL; release test list.

**Files:** `workload-expandable-rows.tsx`, workload actions wiring to `assign-task`, execution route screens, tests listed in [planner_plus_release](planner_plus_release.plan.md).

### Merge waves

1. INT + WP-C (repos + 0177 prepared)  
2. WP-A + WP-B (work UI)  
3. WP-E  
4. WP-D + WP-F  
5. Lead: integrate, focused tests, release flow  

---

## Preserve (non-negotiable)

Owner dashboard; project pages/tabs/photos; global FAB shell; existing task/board data; employee + contractor apps; external storage; project-scoped permissions; Hebrew-first RTL (+ en/ar/ru); financial invariants (Billing ≠ Payment, commitment ≠ expense, VAT off profit); **no** merge tasks/planning tables; **no** duplicate task engines; **no** new paid infra; **no** AI/ML; **no** UI-001/002 portal or PM-012 calendar sync expansion.

---

## Build & release (after Owner presses Build)

1. Parallel WPs → Lead integration.  
2. Focused tests only (per annex); PGlite/isolated DB; **no** Production Supabase test runs.  
3. Local preflight: `db:check-journal`, typecheck, lint, unit, build; `test:migration` if `drizzle/**` changed; **workflow_dispatch** integration + Playwright smoke.  
4. **0177:** if file added → stop block report; **no** Production apply without separate Owner OK.  
5. One commit → push `main` → CI → Vercel Production → short smoke (**do not stop after push**).  
6. Node 22 / existing Vercel memory fixes unchanged.

---

## Acceptance checklist

- [x] `/work` one query per load; `?view=`; upcoming tab = 14 days; date filters on lenses work  
- [x] Saved views `listKey=tasks` across board/calendar/timeline  
- [x] Workload reassign persists via `assign-task`; unauthorized blocked  
- [x] Approved profiles get `/work` without unrelated ERP modules  
- [x] GC: guidance only; no auto `developer_gc`; SEC-004 404 on guarded routes  
- [x] Planning/task dedupe Today + calendar when linked  
- [x] Task detail Related work panel (entity_links + schedule link + resolved titles)  
- [x] My Work project access parity with list/insights  
- [x] Follow-up task creation from RFI, submittal, punch, site instruction, defect (`createLinkedTask` + `entity_links`)  
- [x] **0177** file in repo + reviewed; **not** applied to Production unless Owner approves  
- [ ] CI green on **next** push; Vercel SHA = Git HEAD (release train 1: Vercel success; CI unit job failed on 3138c1fa — verify on closeout push)

---

## Out of scope

Customer portal, Google/Outlook sync, department filter, calendar drag (optional later), dependency auto-enforce, PM-004 CO conversion, BIM/markup, full route/E2E matrices, Production load tests.

---

## Detail index (annexes)

| Topic | Annex |
|-------|--------|
| My Work / lazy / TZ | work_hub_planner_plus_wave1 |
| Filters / saved views | work_hub_saved_views_filters |
| Scale / 0177 outline | tasks_uwm_scale_pagination |
| Profiles / FAB / GC UX | multi_industry_profiles_nav |
| Planning link / dedupe | task_integration_planning_calendar |
| RBAC / tests / release | planner_plus_release |

**Ready for Owner Build:** YES (no further product questions).
