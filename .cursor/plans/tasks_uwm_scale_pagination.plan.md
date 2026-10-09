---
name: Tasks / UWM scale & pagination (baseline 2f13eec6)
overview: Plan-only hardening for My Work egress, list pagination, SQL limits on assignee views, optional indexes, and enrichment batching—no Production load tests or SQL apply.
todos:
  - id: lazy-my-work-tab
    content: "Package B: lazy-load active My Work tab only; optional lightweight tab counts"
    status: pending
  - id: assigned-to-me-join
    content: "Package A: replace unbounded assignee ID fetch with JOIN + limit+1"
    status: pending
  - id: following-view-join
    content: "Package A: same pattern for following view (unbounded follower IDs)"
    status: pending
  - id: workspace-resolve-once
    content: "Package A: hoist accessible workspaceIds once per My Work request"
    status: pending
  - id: migration-0177-prepared
    content: "Prepare 0177 SQL (board_id idx, title trgm, follower idx)—Owner APPROVED prepare; NOT APPROVED Production apply"
    status: pending
  - id: assignee-filter-sql
    content: "Package A: move assignee/label filters into SQL WHERE (post-limit filter fix)"
    status: pending
isProject: true
---

# Tasks / UWM — database scale & Supabase egress (annex)

> **Authority:** [planner_plus_multi_industry_master.plan.md](planner_plus_multi_industry_master.plan.md). **0177 = PREPARED ONLY** (not Production apply).

**Baseline:** `2f13eec6` · **Scope:** tasks module + `/work` · **No code/SQL apply in this wave.**

**Audit anchors:** [PRODUCT-FIT §M–§N](../../docs/audits/PROJECTFLOW-PRODUCT-FIT-TASK-MANAGEMENT-2026-10-09.md) (scale), [CAPABILITY-MAP §J](../../docs/audits/PROJECTFLOW-FINAL-SYSTEM-CAPABILITY-MAP-2026-10-09.md) (0/15 prod flows; migration drift 0172–0176). §I (integrations) is out of scope except noting worker/cron DB load is unverified in prod.

---

## 1 — Pagination / cursor patterns to reuse

| Pattern | Location | Semantics |
|---------|----------|-----------|
| `limit + 1` + `splitTaskListPage` | `src/modules/tasks/domain/list-window.ts` | `hasMore` without COUNT; default 50, cap 500; My Work tab cap 100 |
| `listTasksPage` / `listAccessibleTasksPage` | `tasks.repository.ts`, `list-tasks.ts` | Offset pagination; workspace scope via `inArray(tasks.workspaceId, workspaceIds)` |
| `loadMoreMyWorkAction` / `loadMoreAccessibleTasksAction` | `src/app/[locale]/(app)/work/actions.ts` | Server actions continue offset from client |
| `resolveListLimit` / `resolveListOffset` + `ORG_LIST_HARD_CAP` | `src/shared/db/list-limits.ts` | Portfolio `/portfolio` UI pagination |
| Activity cursor `(occurredAt, id)` | `collaboration/domain/activity.ts`, `activity-feed.ts` | Keyset-style; **not** used for tasks yet—candidate for stable deep pages |
| API projects cursor | `0142_api_v1_index_cleanup.sql` + projects repo | SQL-side cursor filter + composite index |

**Recommendation:** Keep offset + `limit+1` for My Work v1 (already wired in UI). Consider keyset only for global board at 500+ offset if EXPLAIN shows sort cost.

---

## 2 — Bottlenecks (evidence)

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| B1 | **HIGH** | My Work SSR prefetches **9 views × 100** tasks in parallel | `work/page.tsx` L27–37, L57–63; `MY_WORK_VIEW_LIMIT` in `list-window.ts` L8 |
| B2 | **HIGH** | Each prefetch runs full **workspace resolution** + optional `findEmployeeByUserId` | `my-work.ts` L38–78 × 9 |
| B3 | **HIGH** | **`assigned_to_me` loads ALL assignee task IDs** (no LIMIT) then `inArray(tasks.id, ids)` | `my-work.repository.ts` L232–256 |
| B4 | **MEDIUM** | **`following` same two-step unbounded IDs** | `my-work.repository.ts` L277–301 |
| B5 | **MEDIUM** | Enrichment: **9 × mapTasksToCardDataForOrg** → 3 batch queries each (~27 round-trips) | `work/page.tsx` L60; `map-tasks-for-ui.ts` L76–80 |
| B6 | **MEDIUM** | Global board / project lenses fetch up to **500 tasks** per page | `work/board/page.tsx` L45–48; `TASK_LIST_MAX_LIMIT` |
| B7 | **MEDIUM** | **`filters.search` → ILIKE %term%** on title without task trigram index | `tasks.repository.ts` L342–345; projects trgm only in `0142` |
| B8 | **MEDIUM** | **Assignee/label filters applied after LIMIT** (under-filled pages, wrong `hasMore`) | `tasks.repository.ts` L358–400 |
| B9 | **LOW** | No **`tasks.board_id`** index; board pages filter `boardId` + workspace set | `tasks.repository.ts` L326–328; schema indexes in `drizzle/schema/tasks.ts` L257–289 (bucket yes, board no) |
| B10 | **LOW** | **`task_followers`** lacks `(org_member_id, organization_id)` index for following lookup | `tasks.ts` L426–429 |

**Egress model (single `/work` load, admin full scope):** ~9 task queries (up to 900 rows × wide `select()`) + ~27 enrichment queries + 9× workspace list queries → dominant Supabase pooler/egress cost for large orgs (audit PRODUCT-FIT L57, L367).

---

## 3 — Minimal fixes (implementation outline)

### 3.1 Lazy My Work tab (Package B)

- **SSR:** Load only `defaultView` (from `searchParams.view`, default `today`) via single `getMyWorkPage`.
- **Client:** On tab change, if view absent in state, call existing `loadMoreMyWorkAction(view, 0)` (or thin `loadMyWorkTabAction`).
- **Tab badges:** Either omit counts on first paint, or add Package A `getMyWorkTabCounts` (SQL `COUNT(*)` with same predicates, capped/limit-not-needed for badge-only)—avoid prefetching 100 rows per tab for counts.
- **Files:** `src/app/[locale]/(app)/work/page.tsx`, `src/modules/tasks/ui/my-work-view.tsx` (local state merge on tab fetch).

### 3.2 `assigned_to_me` SQL limit (Package A)

Replace ID materialization with single query:

```sql
SELECT tasks.* FROM tasks
INNER JOIN task_assignees ta ON ta.task_id = tasks.id
WHERE tasks.organization_id = $org
  AND tasks.workspace_id = ANY($workspaceIds)
  AND tasks.is_archived = false
  AND tasks.status NOT IN ('done','cancelled')
  AND (ta.org_member_id = $mem OR ta.employee_id = $emp)
ORDER BY tasks.due_date ASC NULLS LAST, tasks.priority ASC
LIMIT $limit + 1 OFFSET $offset
```

- Drizzle: `innerJoin(taskAssignees, …)` + `distinctOn(tasks.id)` or subquery if duplicate assignee rows.
- Update unit test `tests/unit/tasks/my-work-assigned-to-me.test.ts` to expect **one** select chain.

### 3.3 `following` (same package, same PR or follow-up)

- JOIN `task_followers` with `eq(taskFollowers.orgMemberId, orgMemberId)` + limit+1.

### 3.4 Hoist workspace resolution (Package A)

- Add `resolveAccessibleWorkspaceIds(context, filters?)` shared by `list-tasks.ts` and `my-work.ts` (today duplicated L22–44 vs L38–63).
- My Work lazy tabs: resolve **once** per page or per server action call.

### 3.5 Optional `board_id` index

- Add partial index `(organization_id, board_id, sort_key)` WHERE `is_archived = false` if EXPLAIN on project board pages shows seq scan (prepare in 0177; validate on staging only).

### 3.6 Trigram search (PREPARED migration only)

- Mirror `0142` pattern: `idx_tasks_title_trgm ON tasks USING gin (title gin_trgm_ops)` guarded by `pg_trgm`.
- App: keep `ilike` initially; optional switch to `sql\`title % ${term}\`` / `%` operator later.

---

## 4 — Query architecture

```
Page (work/*)
  → withOrgContext
  → listAccessibleTasksPage | getMyWorkPage  [single workspace resolve]
  → listTasksPage | queryMyWorkPage         [one bounded SQL, limit+1]
  → mapTasksToCardDataForOrg                [batch: projects, assignees, clients]
  → serialize → client
```

**N+1 avoidance (already good):** `loadTaskAssigneeDisplayMap` + `queryTaskAssigneeDisplayRows` batch by `taskIds` (`task-assignee-display.repository.ts`).

**Do not:** per-task assignee query in list paths.

**Fix B8:** Push assignee/label filters into SQL JOIN/WHERE before LIMIT; document that offset pagination with JOIN filters may skip rows unless using subquery pattern.

**Detail path:** `getTaskDetail` already parallelizes sub-resources (`tasks.repository.ts` L416+).

---

## 5 — File ownership

| Package | Owns |
|---------|------|
| **A — Tasks backend** | `src/modules/tasks/data/my-work.repository.ts`, `tasks.repository.ts`, `application/my-work.ts`, `application/list-tasks.ts`, `domain/list-window.ts`, `application/map-tasks-for-ui.ts`, `data/task-assignee-display.repository.ts`, unit tests under `tests/unit/tasks/` |
| **B — Work UI / routes** | `src/app/[locale]/(app)/work/page.tsx`, `work/actions.ts`, `src/modules/tasks/ui/my-work-view.tsx`, related loading states |
| **Shared / Lead** | `src/shared/db/list-limits.ts` (only if aligning caps), `drizzle/schema/tasks.ts` + `drizzle/migrations/0177_*.sql` (Lead + Owner SQL review) |
| **Agent E (capability map)** | Cross-cutting `/work/board`, calendar, timeline pages—same list caps, defer lazy load unless in scope |

---

## 6 — Migration SQL outline (0177+, PREPARED — DO NOT APPLY)

**0177_tasks_uwm_scale_indexes.sql** (single file or split):

1. `CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_org_board_active_idx ON tasks (organization_id, board_id, sort_key) WHERE is_archived = false AND board_id IS NOT NULL;`
2. `CREATE INDEX CONCURRENTLY IF NOT EXISTS task_followers_org_member_idx ON task_followers (organization_id, org_member_id, task_id);`
3. `DO $$ … pg_trgm … CREATE INDEX idx_tasks_title_trgm ON tasks USING gin (title gin_trgm_ops); $$`
4. (Optional) `CREATE INDEX … ON task_assignees (organization_id, org_member_id) INCLUDE (task_id);` — only if EXPLAIN on assigned_to_me JOIN still heavy.

**Journal:** next after `0176_project_access_mode_default_selected.sql`.

**Report block before apply:** per `projectflow-release-preflight.mdc`.

---

## 7 — Acceptance criteria & risks

### Acceptance (local / staging; **no Production load tests**)

- [ ] `/work` cold load: **1** My Work query + **1** map enrichment batch for active tab (not 9×).
- [ ] Tab switch loads data via action; load-more offset unchanged.
- [ ] `assigned_to_me` with 10k assignee rows: query plan uses JOIN + LIMIT; no unbounded ID array in app memory.
- [ ] Unit tests updated for assignee/following SQL shape.
- [ ] `listAccessibleTasksPage` with assignee filter returns up to `limit` rows when matches exist (post B8 fix).
- [ ] Prepared 0177 SQL reviewed; static `drizzle-kit check` / journal entry only.

### Risks

| Risk | Mitigation |
|------|------------|
| Lazy tabs: flash empty on first tab switch | Loading skeleton + SWR cache in client |
| JOIN assignee duplicates rows | `distinctOn(tasks.id)` or subselect |
| Offset drift under concurrent inserts | Accept for v1; document; keyset later |
| `CONCURRENTLY` on prod | Owner-approved maintenance window |
| Migration drift (0172–0176 unapplied) | Apply foundation before 0177 |
| Trigram index size on huge `tasks` | Partial index N/A for title; monitor disk |

---

## 8 — Dependencies (Packages A / B)

| Dependency | Direction |
|------------|-----------|
| **B → A** | Lazy tab requires stable `loadMoreMyWorkAction(view, 0)` contract (already exists L168–178 `work/actions.ts`). |
| **A → B** | SSR props shape may shrink to `initialView + initialPage` instead of full `tasksByView`. |
| **A ↔ workspaces** | Shared workspace ID helper touches `modules/workspaces` (read-only refactor). |
| **B.5 / Agent E surfaces** | Board/calendar/timeline share `listAccessibleTasksPage`; cap changes are A-owned, UI load-more B-owned. |
| **0142 index** | `idx_tasks_org_workspace_updated` uses `archived_at IS NULL`; app filters `is_archived`—verify on staging EXPLAIN (possible index mismatch). |
| **§J prod flows** | Scale work does not unblock 0/15 E2E; independent release. |

---

## Verification (non-prod)

- Targeted vitest: `my-work-assigned-to-me`, list pagination tests if added.
- Local EXPLAIN on seeded org (disposable DB only, Owner-approved target).
- Optional: compare Supabase query count via dev logging around `withOrgContext` for one `/work` hit before/after.
