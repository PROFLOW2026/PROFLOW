-- 0114: UWM table privileges for authenticated role.
-- 0097–0106 created RLS policies but omitted table GRANTs (see 0089 pattern).
-- Without GRANTs, authenticated queries fail with 42501 before RLS runs, which
-- aborts the org transaction and breaks the global shell (notification bell).

--------------------------------------------------------------------------------
-- Workspaces & teams (0097)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_workspace_links TO authenticated;

--------------------------------------------------------------------------------
-- Project stages (0098)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_stage_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_stage_transitions TO authenticated;

--------------------------------------------------------------------------------
-- Task boards (0099)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_boards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_buckets TO authenticated;

--------------------------------------------------------------------------------
-- Tasks core (0100)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checklist_items TO authenticated;

--------------------------------------------------------------------------------
-- Task relations (0101)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_dependencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_followers TO authenticated;

--------------------------------------------------------------------------------
-- Comments & activity (0102)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_activity TO authenticated;

--------------------------------------------------------------------------------
-- Recurrence (0103)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_recurrence_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_recurrence_occurrences TO authenticated;

--------------------------------------------------------------------------------
-- Labels (0104)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_label_assignments TO authenticated;

--------------------------------------------------------------------------------
-- Templates (0105)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_template_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_template_tasks TO authenticated;

--------------------------------------------------------------------------------
-- Meetings (0106)
--------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_attendees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_action_items TO authenticated;
