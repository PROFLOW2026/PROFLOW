# Planning vs tasks (PM-005)

**Planning work items** (`@/modules/planning`) model schedule structure: dependencies, Gantt, overdue flags on planning rows.

**Unified work management tasks** (`@/modules/tasks`) model assignable work: assignees, status, evidence, approvals, My Work / Kanban.

**Optional explicit link (migration 0110):** a planning row may set nullable `planning_work_items.task_id` → `tasks.id` (ON DELETE SET NULL). Linking is opt-in from the schedule tab; **no automatic copy of title, dates, or status** in either direction.

**Today dedupe (presentation only):** when a linked planning row would surface as `overdue_planning` and the same UWM task already appears as `task_overdue` / `task_due_today` for the user, Today keeps the task item and drops the planning duplicate. If the user does not see the task lens (no assignee row), schedule overdue remains.

**Org calendar (C1):** when a linked task has a `due_date`, federation skips duplicate planning start/end cells; the task due entry is canonical. If the linked task has no due date, planning `target_end` still appears.

Progress on the project may use `progress_source = tasks` (derived from contributing tasks) independently of planning items.

**Guidance:** use planning for classic project schedule baselines; use tasks for execution and field accountability.
