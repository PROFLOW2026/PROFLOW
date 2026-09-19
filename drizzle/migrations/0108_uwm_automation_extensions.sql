-- Universal Work Management: Extend automation_rules trigger/action enums for tasks.
-- Migration N+12 (0108). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0107.
-- Lead must inspect automation_rules column definitions before applying.

COMMENT ON TABLE public.automation_rules IS
  'UWM 0108: task trigger/action types added in application layer (types.ts).
   If trigger_type and action_type use text + CHECK, Lead drops/recreates constraints below.
   If they use pgEnum, Lead runs ALTER TYPE ... ADD VALUE.';

-- New trigger types (add to existing automation trigger type CHECK/enum):
-- task.status_changed_to
-- task.overdue
-- task.assigned_to
-- task.created_from_template
-- task.approval_rejected
-- task.dependency_resolved
-- milestone.approaching_days
-- project.created

-- New action types (add to existing automation action type CHECK/enum):
-- notify_user
-- create_task
-- change_task_status
-- assign_task
-- add_task_label
-- create_approval

-- Lead resolves exact ALTER TYPE / ALTER TABLE statements based on column type inspection.
