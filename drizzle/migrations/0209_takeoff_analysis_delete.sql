-- PREPARED — apply after review (authenticated delete + RLS). Code also uses service_role until applied.

GRANT DELETE ON public.takeoff_analyses TO authenticated;

DROP POLICY IF EXISTS takeoff_analyses_delete ON public.takeoff_analyses;
CREATE POLICY takeoff_analyses_delete ON public.takeoff_analyses
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'takeoff.manage')
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );