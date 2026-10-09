---
name: Work hub — saved views, filters, context
overview: Minimal reuse of portfolio SavedListViewsBar and URL-backed filters across /work/* (board, calendar, timeline), plus clientId in TaskListFilters. Aligns with Product Fit audit §H, §N @ baseline 2f13eec6. Department filter deferred (no schema). Scale hardening is a dependency, not part of wave 1.
todos:
  - id: sync-saved-list-key-tasks
    content: "Add `tasks` (and `operations` if needed) to SAVED_LIST_KEYS + zod; verify DB CHECK matches drizzle/schema/tenancy.ts"
    status: pending
  - id: work-filter-contract
    content: "Define shared WORK_TASK_QUERY_KEYS + parse/serialize helpers (tasks module)"
    status: pending
  - id: url-filters-repository
    content: "Lift calendar/timeline/board filters to URL + listAccessibleTasksPage; server overdue/blocked/noProject/clientId"
    status: pending
  - id: saved-views-bar-work
    content: "Mount SavedListViewsBar listKey=tasks on /work/board, /work/calendar, /work/timeline (portfolio keys pattern)"
    status: pending
  - id: work-hub-nav-context
    content: "work/layout.tsx + WorkHubNav preserving query string across /work/* tabs"
    status: pending
  - id: client-filter-ui
    content: "clientId picker on work filter bar (reuse portfolio/client list patterns)"
    status: pending
  - id: load-more-filters
    content: "Pass filter snapshot into loadMore* actions (server actions)"
    status: pending
  - id: i18n-acceptance
    content: "tasks.json strings for new filters; manual acceptance vs §O criteria 7–8"
    status: pending
isProject: true
---

# Work hub — cross-project tasks (annex)

> **Authority:** [planner_plus_multi_industry_master.plan.md](planner_plus_multi_industry_master.plan.md). `listKey=tasks`.

**Baseline:** `2f13eec6`  
**Audit source:** `docs/audits/PROJECTFLOW-PRODUCT-FIT-TASK-MANAGEMENT-2026-10-09.md` §H, §N, §O (criteria 7–8).

---

## Current state (verified in tree)

| Area | State |
|------|--------|
| `/work` My Work | 9× prefetch tabs; **no** `searchParams`; **no** saved views |
| `/work/board` | `listAccessibleTasksPage` cap 500; **no** filters; **no** saved views |
| `/work/calendar`, `/work/timeline` | `TaskWorkSurfaceClient` + **client-only** `TaskFiltersBar`; **no** URL; **no** saved views |
| `/portfolio` | **Reference:** `PortfolioFiltersBar` → `SavedListViewsBar` `listKey="portfolio"` with explicit `keys=[...]` |
| `SavedListViewsBar` | Server component: `compactSearchQuery(searchParams, keys)` → `SavedListViewsControl` (apply view = `router.push(pathname?query)`) |
| `SAVED_LIST_KEYS` (domain) | **Missing** `tasks`, `operations` |
| `saved_list_views` DB CHECK (0107 + drizzle) | **Includes** `tasks`, `portfolio`, `workload`, `operations` |
| `savedListViewScopeEnum` | `private` \| `organization` — column exists; **save flow always private** (scope not in zod/actions) |
| `TaskListFilters` | status, priority, assignee*, label, due*, project, board, bucket, search — **no** `clientId`, **no** overdue/blocked/noProject |
| `tasks.repository` | `search` = title `ILIKE` only; assignee/label filtered **post-limit** (scale smell) |
| `global-search.ts` | `searchTasks` — title + project `documentNumber`; workspace + project access scoped |
| Department | **No** org/employee department field in schema — audit “missing” is accurate |

---

## 1. Reuse pattern from portfolio for `/work` routes

### Target UX (match portfolio)

1. **Filter bar** writes **URL query** (not React-only state).
2. **Server page** reads `searchParams` → builds `TaskListFilters` → `listAccessibleTasksPage`.
3. **`SavedListViewsBar`** with fixed `listKey` and explicit `keys` (exclude route-only params like `page` if added later).

### Recommended `listKey`: **`tasks`** (single key across work lenses)

- One saved view “Overdue ACME client” applies on board, calendar, and timeline.
- **Exclude** `/work` My Work hub from v1 saved views **or** use separate key `work_my` only if product insists on saving tab (`today` vs `overdue`). Audit §N names `/work` explicitly — **minimal compromise:** save **`tasks`** on board/calendar/timeline first; add optional `hubView` query on `/work` in wave 2 without mixing into `tasks` saved queries until My Work is URL-driven.

### Shared chrome (new, tasks-owned)

- `src/modules/tasks/ui/work-task-filter-keys.ts` — canonical query key list + parse/serialize.
- `src/modules/tasks/ui/work-task-filters-bar.tsx` — client bar (extend `TaskFiltersBar` or replace for work routes only) using `useRouter` + `usePathname` like `portfolio-filters-bar.tsx`.
- Optional `src/modules/tasks/ui/work-list-chrome.tsx` — wraps filters + slot for `SavedListViewsBar` children from page.

### Per-route wiring

| Route | Filters v1 | SavedListViewsBar |
|-------|------------|-------------------|
| `/work/board` | Same URL keys as calendar (status, priority, search, clientId, overdue, blocked, noProject, projectId, labelId, assigneeEmployeeId) | Yes, same `keys` |
| `/work/calendar` | Replace in-component state with URL + pass initial state from server | Yes |
| `/work/timeline` | Same as calendar | Yes |
| `/work` | Defer saved views to wave 2 unless `hubView` URL added | Optional |
| `/work/insights` | Out of scope (analytics, not task list) | No |

### Tenancy (unchanged pattern)

```tsx
<SavedListViewsBar
  listKey="tasks"
  searchParams={/* picked params */}
  keys={WORK_TASK_QUERY_KEYS}
/>
```

---

## 2. Gaps

### `clientId`

- **Portfolio:** `getPortfolio` filters `p.client_id`.
- **Tasks:** `map-tasks-for-ui` joins `clients` for **display** (`clientName`); filter absent in `TaskListFilters` / repository.
- **Fix:** `clientId?: string` on `TaskListFilters`; repository `innerJoin(projects)` + `eq(projects.clientId, …)` when set; respect project access (tasks without project excluded when client filter set, unless product wants “orphan tasks” exception — default: exclude null `projectId`).

### Department

- **No column** on employees/projects/tasks in baseline schema.
- **Do not** invent department in wave 1.
- **Substitutes for PMO:** `assigneeEmployeeId`, `projectId`, `clientId`, `labelId` (team labels).
- **Future:** org setting + custom field on project, or workforce taxonomy — separate product decision + migration.

### Context preservation across `/work/*`

- **Today:** `navigation.ts` static `href: '/work/board'` etc. — **drops** query.
- **Fix:** `src/app/[locale]/(app)/work/layout.tsx` + client `WorkHubNav` that reads `useSearchParams()`, builds `href={`/work/board?${search}`}` for sibling routes.
- **SavedListViewsControl** already applies views on **current pathname** — correct per lens; shared `listKey` + shared query keys gives cross-route continuity when user switches tab.
- **Strip lens-only params** from shared set (none today). **Do not** persist `page`/`offset` in saved views.

### Advanced filters vs today

- `overdue`, `blocked`, `noProjectOnly` exist only in `applyClientTaskFilters` — saved views would **lie** until moved to SQL (or documented as “calendar/timeline only client filter” — rejected for minimal honest scope).
- **`assigneeEmployeeId`** in API but not in `TaskFiltersBar` — add to work bar if PMO need (low cost once URL pipeline exists).

### Search

- **List filter `search`:** server title ILIKE (align with repository).
- **Global search:** unchanged; optional follow-up: “Open in work hub with ?search=” from hit — not wave 1.
- **Client-side haystack** (title + project + clientName) **remove** for work surfaces once server search + clientId exist (or keep as redundant narrow — prefer single server truth).

---

## 3. Minimal changes + enum / list_key

| Change | Required? |
|--------|-----------|
| Add `'tasks'` to `SAVED_LIST_KEYS` + `saveSavedListViewSchema` | **Yes** (app/DB drift) |
| Add `'operations'` to domain array | **Only if** saving views on `/operations` — out of this mission |
| New `saved_list_view_scope` enum value | **No** |
| New PG enum for task filters | **No** |
| SQL migration extending `saved_list_views_key_known` | **Only if** Production DB predates 0107 and lacks `tasks` in CHECK — **prepare, do not apply** without Owner SQL approval |
| `TaskListFilters` + repository | **Yes** for `clientId` + boolean filters if URL-backed |
| `work/layout.tsx` | **Yes** for context nav |
| My Work lazy load (§N #9) | **Wave 2** — orthogonal but reduces pain when filters added to hub |

**No new list_scope enum value.**

---

## 4. File ownership

| Owner | Files / areas |
|-------|----------------|
| **Tasks module** | `domain/types.ts` (`TaskListFilters`); `data/tasks.repository.ts`; `application/list-tasks.ts`; `ui/task-filters-bar.tsx` or `work-task-filters-bar.tsx`; `ui/task-work-surface-client.tsx`; `ui/work-hub-nav.tsx`; `ui/work-task-filter-keys.ts`; tests under `tests/` for filter parsing + repo clientId |
| **App routes** | `src/app/[locale]/(app)/work/layout.tsx`; `page.tsx`, `board/page.tsx`, `calendar/page.tsx`, `timeline/page.tsx`; `work/actions.ts` (load-more filter args) |
| **Tenancy** | `domain/saved-list-views.ts` (SAVED_LIST_KEYS only); no bar logic changes |
| **Portfolio** | **Read-only** reference — do not coupling portfolio → tasks |
| **Search** | **No change** wave 1 |
| **Shell** | Optionally switch work items to layout nav only — avoid duplicating nav in pages |
| **Locales** | `src/locales/*/tasks.json` filter labels |
| **Drizzle** | Confirm `tenancy.ts` CHECK includes `tasks`; migration script **if** prod drift |

---

## 5. Dependencies (scale package)

Saved views **without** server-side filters **do not fix** §J scale issues; they **encode** filter state for repeat use.

| Dependency | Why | Blocker for saved views? |
|------------|-----|---------------------------|
| URL + server filters on work surfaces | Saved views must match fetched set | **Yes — prerequisite** |
| `loadMore*` passes same `TaskListFilters` | Otherwise saved view truncates wrong | **Yes** |
| Pagination / `assigned_to_me` SQL limit (§N #11) | My Work scale | No for board/calendar |
| Trigram/GIN on title (§N #12) | Search at 50k tasks | No for MVP saved views |
| Virtualization | UI perf on 500+ loaded cards | No for MVP |
| Lazy My Work tabs | `/work` perf | Recommended parallel wave 2 |

**Recommendation:** Ship **filter URL + saved views + clientId** together; schedule **scale package** (pagination, index, lazy hub) as follow-on with measured prod query plans.

---

## 6. Migrations

1. **`saved_list_views` list keys only**  
   - If app adds `'tasks'` to domain and DB already has CHECK from **0107** → **no migration**.  
   - If any environment CHECK omits `tasks` → additive migration: `DROP/ADD CONSTRAINT saved_list_views_key_known` matching `drizzle/schema/tenancy.ts` (include full list, not only `tasks`).

2. **Task filter fields**  
   - **No schema change** for `clientId` filter (uses existing `projects.client_id`).

3. **Department**  
   - Deferred — would need workforce/project column + migration.

4. **Scope `organization` shared views**  
   - Not in minimal scope; would use existing `scope` column + app/RLS review — defer.

**SQL execution:** prepare → report → STOP per release preflight.

---

## 7. Acceptance criteria

Aligned with audit §O #7–8 and §N wave 1 items 1–2, 7.

1. User on `/work/calendar` sets filters (incl. **client**), URL updates; refresh preserves state.
2. User saves named view; reload; select view restores query; **same view** available on `/work/board` and `/work/timeline` (`listKey=tasks`).
3. Switching work hub tabs via **in-layout nav** **retains** filter query string.
4. `clientId` filter returns only tasks whose **project** belongs to that client; tasks user cannot access remain excluded via existing workspace/project scope.
5. Overdue / blocked / no-project filters affect **server** result set on calendar/timeline/board (not only client slice of first 500).
6. Load more continues with **same** filters until `hasMore` false.
7. User without `TASKS_READ` or `work_management` module → 404 unchanged.
8. Saving view with >20 keys or invalid key names → validation error (existing saved view limits).
9. **Regression:** portfolio saved views unchanged; global task search unchanged.
10. **Hebrew/RTL:** filter bar layout unchanged (logical CSS).

**Out of scope v1:** department filter; org-wide shared saved views; `/work` My Work saved tabs; calendar drag reschedule; insights filters.

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| **App vs DB `list_key` drift** breaks save | Ship domain `tasks` + verify CHECK on target DB before deploy |
| **500 cap + client-side filter history** | Server filters + honest “has more”; document that extreme orgs still need scale wave |
| **Post-limit assignee/label filter** skews pages | When adding assignee/label to work bar, prefer SQL joins for those filters on work routes (narrow refactor in repository) |
| **Board DnD + full reload** | Keep optimistic UI; filters from URL on reload |
| **My Work 9× prefetch** | Do not add saved views there until lazy load; avoid doubling fetch |
| **Saved view keys mismatch** between routes | Single `WORK_TASK_QUERY_KEYS` constant imported by all work pages + bar |
| **`queriesMatch` false positives** | Same as portfolio — key order normalized |
| **Production SQL for CHECK** | Owner-approved migration only |
| **Criterion 8 “board/list/calendar/timeline”** | Partial until `/work` hub shares filters — document in release notes |

---

## Suggested implementation order

1. `tasks` in `SAVED_LIST_KEYS` + filter key contract  
2. Repository + types (`clientId`, overdue, blocked, noProject)  
3. URL filter bar + update calendar/timeline pages  
4. Board page: same fetch + filters (board view filters columns client-side by status still OK — status filter in URL should filter **incoming** tasks)  
5. `SavedListViewsBar` on three pages  
6. `work/layout.tsx` + context nav  
7. Client picker UI  
8. Load-more filter threading  
9. Targeted tests + manual QA checklist above  

---

*Plan only — no implementation until Owner approves build scope.*
