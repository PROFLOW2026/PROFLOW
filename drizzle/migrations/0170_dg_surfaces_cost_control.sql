-- 0170_dg_surfaces_cost_control
-- Contractor portal milestones. project_milestones (0008) is selectable only by org members.
-- A contractor is not an org member. This policy lets a principal who can already see the
-- project read its non-archived milestones. No insert, update, or delete.

DROP POLICY IF EXISTS project_milestones_external_select ON public.project_milestones;
CREATE POLICY project_milestones_external_select
  ON public.project_milestones
  FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND app.external_can_see_project(organization_id, project_id)
  );
