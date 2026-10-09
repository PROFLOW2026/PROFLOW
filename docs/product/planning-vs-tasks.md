# Planning vs tasks (PM-005)

**Planning work items** (`@/modules/planning`) model schedule structure: dependencies, Gantt, overdue flags on planning rows.

**Unified work management tasks** (`@/modules/tasks`) model assignable work: assignees, status, evidence, approvals, My Work / Kanban.

There is **no automatic bi-directional link** between a planning row and a task in V1. Progress on the project may use `progress_source = tasks` (derived from contributing tasks) independently of planning items.

**Guidance:** use planning for classic project schedule baselines; use tasks for execution and field accountability.
