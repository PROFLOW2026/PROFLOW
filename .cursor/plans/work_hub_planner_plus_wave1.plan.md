---
name: Work hub Planner+ parity (wave 1)
overview: Close Planner-like daily hub gaps on existing /work routes by reusing UWM task modules—lazy My Work, shared filters/context, saved views, and access parity—without new pages or task schema in wave 1.
todos:
  - id: lazy-my-work
    content: "Lazy-load My Work: fetch active view only; optional client fetch on tab switch via loadMoreMyWorkAction pattern"
    status: pending
  - id: work-shell-filters
    content: "Shared work layout + URL query (view, projectId, clientId, assignee); wire TaskFiltersBar to server listTasks where needed"
    status: pending
  - id: saved-views-work
    content: "SavedListViewsBar listKey=tasks on board/calendar/timeline; add tasks to SAVED_LIST_KEYS (DB CHECK already has tasks — migration only if prod drift)"
    status: pending
  - id: client-filter-tasks
    content: "clientId on TaskListFilters + tasks.repository join/filter (no new columns)"
    status: pending
  - id: access-parity
    content: "Apply resolveAccessibleProjectIds in my-work.repository + listTasksPage (match get-task-insights)"
    status: pending
  - id: my-work-tz-completed
    content: "Pass org today into queryMyWorkPage; completed window 30d; upcoming default 14d (Owner approved); URL dueFrom/dueTo on org lenses"
    status: pending
  - id: mobile-tab-labels
    content: "My Work tab labels visible on sm breakpoint (my-work-view ViewTabBar)"
    status: pending
isProject: true
---

# Work hub — Planner+ gap closure (annex)

> **Authority:** [planner_plus_multi_industry_master.plan.md](planner_plus_multi_industry_master.plan.md) (Owner approved 2026-10-10). Upcoming default **14 days**; conflicts → master wins.

Baseline: `2f13eec6`. Scope: `src/app/[locale]/(app)/work/*`, `my-work.ts`, list repos, My Work / list / filters UI, `MY_WORK_VIEWS`.

Reference: `docs/audits/PROJECTFLOW-PRODUCT-FIT-TASK-MANAGEMENT-2026-10-09.md` §B,C,H,N; Agent E (§F); UWM plan My Work section in `.cursor/plans/universal_work_management_fe4f363f.plan.md`.
