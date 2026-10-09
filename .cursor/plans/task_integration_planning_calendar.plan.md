---
name: Task integration (planning, calendar, execution)
overview: Wire optional planning_work_items.task_id (0110), dedupe Today/calendar when the same work appears in two lenses, and add minimal execution references (RFI, submittals, punch, site instructions) via entity_links — without merging tasks and planning tables. Baseline commit 2f13eec6.
todos:
  - id: drizzle-task-id
    content: "Add planning_work_items.taskId to Drizzle schema + domain/repo/schemas; verify 0110 applied in target envs"
    status: pending
  - id: planning-ui-link
    content: "Opt-in UI on schedule tab — link/unlink/search task; show badge + deep link on Gantt row"
    status: pending
  - id: dedupe-today
    content: "Post-collect dedupe policy in command-center for linked planning↔task and task approval double surfacing"
    status: pending
  - id: dedupe-calendar
    content: "Calendar federation — suppress duplicate day cells when planning row has task_id (canonical task entry)"
    status: pending
  - id: execution-links
    content: "Task detail Related work panel — list entity_links; createLinkedTask from RFI/submittal/punch/instruction"
    status: pending
  - id: tests-acceptance
    content: "Unit tests for dedupe + planning link persistence; update PM-005/PM-011 product docs"
    status: pending
isProject: true
---

# Task integration (annex, baseline `2f13eec6`)

> **Authority:** [planner_plus_multi_industry_master.plan.md](planner_plus_multi_industry_master.plan.md). Do not merge tasks/planning tables.

**Mission:** Integrate UWM **tasks** with **planning**, **calendar**, **documents**, **teams**, **approvals**, and **project execution** while keeping **`tasks`** and **`planning_work_items`** as separate SSOT layers (PM-005, PM-011).

**Non-goal:** Merge tables, mirror rows, or auto-sync all dates/statuses bi-directionally.

---

## Current state (inspected)

| Area | Finding |
|------|---------|
| **DB** | Migration `0110_uwm_planning_task_link.sql` adds nullable `planning_work_items.task_id` → `tasks(id)` ON DELETE SET NULL + partial index. |
| **Drizzle** | `drizzle/schema/planning.ts` has **no** `taskId` column — **schema drift** vs applied 0110. |
| **Domain/repo** | `PlanningWorkItem` type and `drizzle-planning.repository.ts` omit `task_id`; upsert schema has no link field. |
| **PM docs** | `docs/product/planning-vs-tasks.md` (PM-005) states no automatic link; `docs/product/calendar-four-lenses.md` (PM-011) four lenses, no unified table. |
| **Today** | `collectOverduePlanning` (`overdue_planning`) and `collectTaskOverdue` (`task_overdue`) run independently — **no dedupe**. Comment in `collect-tasks.ts` explicitly splits schedule vs UWM overdue. |
| **Today (approvals)** | `collectOpenApprovals` surfaces all `submitted` requests; `collectTaskApprovalRequested` surfaces task approvals for `TASKS_APPROVE` — **same approval can appear twice** for approvers with both permissions. |
| **Calendar** | `source-dates.repository.ts` emits **both** planning start/end rows and native `tasks` due dates — **duplicate “task” semantics** when names/dates align; ignores `task_id`. |
| **Meetings** | `meeting_action_items.task_id` + create-task flow (`manage-action-items.ts`, source `meeting_action`). |
| **Coordination** | `coordination_issues.task_id` + `createLinkedTask` (`manage-events.ts`). |
| **Site meetings (DG)** | `site_meeting_publication_actions.task_id` + `createLinkedTask` + entity_links. |
| **Approvals on tasks** | `approval_requests.entity_type = 'task'` (0112 index); UI `TaskApprovalGate`, `load-task-approvals-for-display.ts`. |
| **Documents on tasks** | `document_links` owner types `task` / `task_comment`; task detail `TaskDocumentAttachments`. |
| **RFI / submittals / punch / instructions** | Command Center via DG ports (RFI overdue) and field collectors (`punch_open`); **no** task FK on RFI/submittal/punch tables. Link pattern elsewhere: `createLinkedTask` + **`entity_links`** (`collaboration/contractor-tasks.ts`); entity-access resolvers exist for `rfi`, `submittal`, `site_instruction`, `defect` (quality), not yet `punch_list_item` for links. |
| **Dependencies** | **Two graphs:** `planning_dependencies` (work item IDs) vs `task_dependencies` (task IDs) — must stay separate. |

---

## 1. Optional explicit link — `planning_work_items.task_id`

### Data layer

1. **`drizzle/schema/planning.ts`**
   - Add `taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' })` on `planningWorkItems`.
   - Import `tasks` from `./tasks`.
   - Mirror partial index `planning_work_items_task_idx` in Drizzle index definitions (match 0110).
   - **Optional additive migration (Owner review only):** `UNIQUE (organization_id, task_id) WHERE task_id IS NOT NULL` so one UWM task links to at most one planning row (prevents dedupe ambiguity). Not required for V1 if product accepts “last writer wins”.

2. **Domain** — `src/modules/planning/domain/types.ts`
   - Add `readonly taskId: string | null` to `PlanningWorkItem`.

3. **Repository** — `drizzle-planning.repository.ts` + in-memory store
   - Map `taskId` in `mapWorkItem`; include in insert/upsert `set`.

4. **Validation** — `upsertPlanningWorkItemSchema`
   - Optional `taskId` UUID; on set, validate:
     - Task exists, same `organizationId`, same `projectId` as work item.
     - Caller has `TASKS_READ` (link) and `PLANNING_WRITE` (save row).
   - **Do not** auto-copy title/dates from task on link (explicit opt-in only).

5. **Application** — new small use case `linkPlanningWorkItemToTask` / `unlinkPlanningWorkItemTask`
   - Clear `taskId` on archive of either side is already handled by FK SET NULL on task delete; on planning archive, leave task unchanged.

### UI (opt-in)

6. **`PlanningWritePanel` / schedule tab**
   - For `kind === 'task'` rows only (not milestones): optional “Link to execution task” control.
   - Pattern: combobox search project tasks (`listProjectTasks` or existing project task picker from work tab).
   - Display: linked task title + link to `/tasks/{id}`; “Unlink” clears column.
   - **No** “Create task from planning row” in V1 unless Owner asks — avoids silent duplication; prefer link existing or manual task create elsewhere.

7. **Copy (PM-005 / PM-011)**
   - Schedule tab helper text: Gantt dates ≠ My Work due dates unless you link a row.
   - Update `docs/product/planning-vs-tasks.md` to document 0110 link semantics (still no auto sync).

### Optional progress reflection (defer or flag)

- Migration comment allows optional progress reflection — **default off**.
- If ever added: org/project flag `planning.reflect_linked_task_status` → when `task.status === 'done'`, set `progress_percent = 100` only (never write task from planning).

---

## 2. Today / calendar dedupe policy

### Principles

- **Two lenses remain valid** (PM-011); dedupe is **presentation**, not data merge.
- **Canonical surface for linked execution work:** UWM **task** (assignee-centric Today, `/tasks` href).
- **Canonical surface for unlinked schedule slip:** **planning** (`overdue_planning`, schedule tab).

### Today (`get-actionable-inbox` / collectors)

Implement a **post-collect `dedupeCommandCenterItems(items)`** step (pure function + unit tests) before persona filter:

| Rule ID | Condition | Action |
|---------|-----------|--------|
| **D1** | Planning row `P` has `task_id = T`, and collectors emit both `overdue_planning(P)` and `task_overdue(T)` or `task_due_today(T)` for same user | Drop **`overdue_planning`**; keep task item; set `meta.scheduleLinkedTaskId = T` and optional `dedupeHref` to task href (mirror billing pattern in `merged-inbox.ts`). |
| **D2** | Same as D1 but user lacks `TASKS_READ` / assignee scope on task | Keep **`overdue_planning`** only (schedule still actionable). |
| **D3** | `open_approval` with `entityType === 'task'` and `entityId === T` | Drop **`open_approval`** row when user also gets **`task_approval_requested`** for same `approvalId` (match on `sourceId` / approval id). Approvers see task-scoped item with deep link; generic inbox row removed. |
| **D4** | `punch_open` / DG RFI overdue + linked task via `entity_links` (`source → task`, relation `follow_up`) | **Keep both** in V1 unless Owner wants punch suppressed when open linked task exists — document as product choice. Recommended V1: keep punch (field SSOT), add `meta.linkedTaskId` on punch row for UI hint only. |
| **D5** | Milestone approaching (`collect-tasks`) vs `projectMilestones` vs planning milestone kind | No change — different SSOTs; only dedupe when **`task_id`** FK present (D1). |

**Implementation notes**

- D1 requires `collectOverduePlanning` to **select `task_id`** (after Drizzle wire-up) or a cheap join map `{ planningWorkItemId → taskId }`.
- Do **not** dedupe by title/date heuristic alone (false positives).

### Org calendar (`listExistingDatedSources`)

| Rule | Behavior |
|------|----------|
| **C1** | When emitting planning start/end for row `R`, if `R.task_id` is set, **skip** planning calendar entries for that row (task due date already emitted as `task:{id}`). |
| **C2** | If linked task has **no** `due_date`, still show planning **target_end** (schedule lens visible). |
| **C3** | `href` for linked task entries: `/tasks/{id}`; planning entries remain `/projects/{id}?tab=schedule`. |

### Work calendar / tasks module

- No change to task-only calendar views.
- PM-011 doc add one paragraph on dedupe rules C1–C2.

---

## 3. Minimal execution links (reference, not duplicate)

**Pattern:** Reuse **`createLinkedTask`** (`@/modules/collaboration`) + **`entity_links`** (`source_type` = domain entity, `target_type` = `task`, `relation` = `follow_up` | `remediation`).

| Domain | SSOT | Link mechanism today | Planned minimal addition |
|--------|------|----------------------|---------------------------|
| **RFI** | `rfis` | CC overdue via DG; no task FK | Task detail **Related** panel: list links where `target_id = task`; action “Create follow-up task” from RFI detail (or from task: pick RFI) → `createLinkedTask` with `sources: [{ entityType: 'rfi', entityId }]`. |
| **Submittals** | `submittals` | Same | Same with `entityType: 'submittal'`. |
| **Punch** | `punch_list_items` | `document_links` owner `punch_list_item`; CC `punch_open` | Register **`punch_list_item`** in entity-access if missing; add createLinkedTask from punch detail + show link on task. |
| **Site instructions** | `site_instructions` | Conversion port uses entity_links for commercial records | Add optional follow-up task (operational) via `createLinkedTask` — **do not** duplicate instruction body on task; title + link only. |
| **Meetings / coordination** | Already have `task_id` columns | Existing flows | Task detail panel reads FK + entity_links for back-links. |

**Task detail UI (single panel)**

- New server loader: `listEntityLinksForTask(taskId)` + reverse FKs (meeting action items, coordination issues where applicable).
- Render read-only chips with deep links to source records.
- **Do not** duplicate RFI/submittal status on task row — task keeps its own status.

**Command Center (optional wave 2)**

- When punch/RFI has linked open task assigned to current user, prefer elevating task severity — still not duplicate rows if D4 kept.

---

## 4. File ownership (who edits what)

| Concern | Owner module / path |
|---------|---------------------|
| Drizzle planning schema + planning migrations prep | `drizzle/schema/planning.ts`, Lead / planning track |
| Planning domain, Gantt UI, schedule actions | `src/modules/planning/**`, `projects/planning-actions.ts` |
| Task CRUD, assignees, dependencies, boards | `src/modules/tasks/**`, `work/actions.ts` |
| Optional planning↔task link use cases | `src/modules/planning/application/` (link only; no task writes except optional future flag) |
| `createLinkedTask` + entity_links writes | `src/modules/collaboration/**` |
| Entity-access resolvers for link validation | `src/shared/entity-access/resolvers/*` (+ register `punch_list_item` if needed) |
| Today / bell collectors & dedupe | `src/modules/command-center/**` |
| Org calendar federation | `src/modules/calendar/data/source-dates.repository.ts` |
| Task approvals | `src/modules/tasks/ui/task-approval-gate.tsx`, `src/modules/approvals/**` |
| Task documents | `src/modules/documents/**`, `TaskDocumentAttachments` |
| Meetings action items | `src/modules/meetings/**` |
| RFI / submittals UI actions | `src/modules/rfi/**`, `src/modules/submittals/**` |
| Punch / field ops | `src/modules/field-ops/**` |
| Site instructions | `src/modules/site-instructions/**` |
| Product semantics docs | `docs/product/planning-vs-tasks.md`, `docs/product/calendar-four-lenses.md` |

**Integration rule:** Cross-module calls go through **application ports** (e.g. collaboration `createLinkedTask`, tasks `getTaskDetail`) — no UI importing foreign repositories directly.

---

## 5. Dependencies (planning vs tasks)

- **Planning graph:** edges only between `planning_work_items.id` (`planning_dependencies`) — unchanged.
- **Task graph:** edges only between `tasks.id` (`task_dependencies`) — unchanged.
- **No cross-table dependency rows** in V1.
- **Link semantics:** `planning_work_items.task_id` is informational for navigation/dedupe; it does **not** imply FS edges propagate to task `blocked_by`.
- **Future (explicitly out of scope):** optional job to suggest task dependency when planning predecessor link exists **and** both rows share `task_id` — not in this plan.

---

## 6. Migration strategy

| Scenario | Action |
|----------|--------|
| **Drizzle out of sync (0110 already applied in Production)** | Code-only: add column to Drizzle schema to match DB — **no new SQL**. Run journal/static check; **do not** run `db:migrate` without Owner SQL approval. |
| **Env where 0110 not applied** | Owner applies existing `0110_uwm_planning_task_link.sql` via approved migrate — not a new file. |
| **Optional uniqueness on `task_id`** | New **additive** migration (next number after HEAD) — prepared only, Owner review — partial unique index per org. |

Verify at implementation time:

```
SQL / MIGRATION PREPARED = (only if optional unique index added)
```

---

## 7. Acceptance criteria

1. **Drizzle** `planningWorkItems` includes nullable `taskId` matching live DB after 0110.
2. **Schedule UI:** User can link/unlink a planning row (`kind=task`) to an existing project task; milestone rows hide link control.
3. **Validation:** Cross-project / cross-org task link rejected.
4. **Today D1:** Linked planning overdue + assignee task overdue → **one** inbox row (task), not two.
5. **Today D3:** Task approver with both approval permissions → **one** row (`task_approval_requested`), not duplicate generic `open_approval` for same request id.
6. **Calendar C1/C2:** Linked row with task due date → no duplicate planning end marker; linked row without task due → planning date still visible.
7. **Execution:** From RFI or punch detail, user can create linked task; task detail shows back-link to source via entity_links (or FK for meetings).
8. **Documents / approvals / meetings:** Existing task attachment and approval flows unchanged (regression smoke on task detail page).
9. **Tests:** Unit tests for `dedupeCommandCenterItems` (D1, D3); planning repository round-trip with `taskId`; calendar list filter C1.
10. **Docs:** PM-005 and PM-011 updated with link + dedupe policy (no merge language).

---

## 8. Risks (double counting & trust)

| Risk | Mitigation |
|------|------------|
| **Same work, two overdue signals** (planning target vs task due) | D1 dedupe when `task_id` set; educate via PM-005 copy when not linked. |
| **Calendar clutter** (planning start + end + task due) | C1 skip planning when linked + task has due; show at most one execution date. |
| **Duplicate tasks created from punch + RFI + manual** | No auto-create from planning; linked tasks use explicit user action; entity_links idempotent edge unique. |
| **Progress double-counting** on project rollups | `progress_source = tasks` ignores planning; planning `%` independent — do not sum both in one KPI without product spec. |
| **Approval noise** | D3 dedupe; keep task-scoped href. |
| **Today cap 80 items** | Dedupe frees slots; monitor `PER_SOURCE_CAP` unchanged. |
| **Schema drift** | Drizzle fix prevents ORM silently omitting `task_id` on future planning writes that overwrite null. |
| **Multiple planning rows → one task** (if no unique index) | Ambiguous D1; recommend optional unique partial index. |
| **Assignee vs schedule audience** | D2 preserves planning alert for users without task visibility. |

---

## Suggested implementation order

1. Drizzle + domain/repo/schemas (unblocks collectors/calendar).
2. Dedupe pure function + tests (immediate user-visible win).
3. Calendar C1/C2.
4. Planning UI link control.
5. Task Related panel + RFI/punch createLinkedTask entry points.
6. Doc updates PM-005 / PM-011.

**Estimated touch surface:** ~15–25 files, no table merge, zero changes to `planning_dependencies` / `task_dependencies` semantics.
