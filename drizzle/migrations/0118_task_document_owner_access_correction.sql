-- 0118: Restore complete document-owner access after 0117 overwrite + org consistency.
-- Migration after 0117. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0117.
--
-- 0117 replaced app.can_access_next_gen_document_owner with a subset missing
-- outbound_communication and calendar_event (last full definition: 0057).
-- This migration restores the 0057 superset and adds task / task_comment safely.

CREATE OR REPLACE FUNCTION app.can_access_next_gen_document_owner(
  p_organization_id uuid,
  p_owner_type text,
  p_owner_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_owner_type = 'task' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = p_owner_id
        AND t.organization_id = p_organization_id
        AND app.uwm_user_can_read_task_id(t.id)
    );
  END IF;
  IF p_owner_type = 'task_comment' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.task_comments tc
      WHERE tc.id = p_owner_id
        AND tc.organization_id = p_organization_id
        AND app.uwm_user_can_read_task_id(tc.task_id)
    );
  END IF;
  IF p_owner_type = 'warranty_coverage' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warranty_coverages w
      WHERE w.id = p_owner_id
        AND w.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, w.project_id)
    );
  END IF;
  IF p_owner_type = 'warranty_issue' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warranty_issues i
      WHERE i.id = p_owner_id
        AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  IF p_owner_type = 'closeout' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.project_closeouts c
      WHERE c.id = p_owner_id
        AND c.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, c.project_id)
    );
  END IF;
  IF p_owner_type = 'outbound_communication' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.outbound_communications o
      WHERE o.id = p_owner_id
        AND o.organization_id = p_organization_id
        AND app.has_org_permission(p_organization_id, 'communications.read')
        AND o.project_id IS NOT NULL
        AND app.can_access_project(p_organization_id, o.project_id)
    );
  END IF;
  IF p_owner_type = 'calendar_event' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.calendar_events e
      WHERE e.id = p_owner_id
        AND e.organization_id = p_organization_id
        AND app.has_org_permission(p_organization_id, 'scheduling.read')
        AND e.project_id IS NOT NULL
        AND app.can_access_project(p_organization_id, e.project_id)
    );
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- task_reminders: enforce task_reminders.organization_id = tasks.organization_id
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS task_reminders_select ON public.task_reminders;
CREATE POLICY task_reminders_select ON public.task_reminders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_reminders.task_id
        AND t.organization_id = task_reminders.organization_id
    )
    AND app.uwm_user_can_read_task_id(task_id)
  );

DROP POLICY IF EXISTS task_reminders_insert ON public.task_reminders;
CREATE POLICY task_reminders_insert ON public.task_reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_id
        AND t.organization_id = organization_id
    )
    AND app.uwm_user_can_update_task_id(task_id)
  );

DROP POLICY IF EXISTS task_reminders_update ON public.task_reminders;
CREATE POLICY task_reminders_update ON public.task_reminders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_reminders.task_id
        AND t.organization_id = task_reminders.organization_id
    )
    AND app.uwm_user_can_update_task_id(task_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_id
        AND t.organization_id = organization_id
    )
    AND app.uwm_user_can_update_task_id(task_id)
  );

DROP POLICY IF EXISTS task_reminders_delete ON public.task_reminders;
CREATE POLICY task_reminders_delete ON public.task_reminders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_reminders.task_id
        AND t.organization_id = task_reminders.organization_id
    )
    AND app.uwm_user_can_update_task_id(task_id)
  );
