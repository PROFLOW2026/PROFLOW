# Schema request — Service / Work Orders / Dispatch (Agent 6)

Lead-owned migrations 0024–0028 must not be edited by feature agents.
`project_service_details` already covers most WO fields. Gaps below are needed
for first-class dispatch assignee and checklist UX.

## Requested columns on `project_service_details`

| Column | Type | Notes |
|--------|------|--------|
| `assignee_employee_id` | `uuid` nullable, FK → `employees(id)` ON DELETE SET NULL | Primary technician/employee for dispatch. Today we approximate via `employee_project_assignments` with `role='assignee'` (≠ Actual). |
| `assignee_team_id` | `uuid` nullable | Optional team bucket if/when teams exist. Defer if no teams table yet. |

## Indexes

- `(organization_id, assignee_employee_id, scheduled_start_at)` for daily dispatch by person.

## Checklist

- `checklist_template_id` column already exists; wire to Forms module templates when Agent 10 lands. No schema change required for V1 link storage.

## Not requested

- Do **not** add a second financial / Actual table for work orders.
- Recurrence tables are Agent 7 / already in 0026.
