-- Task document attachments: activity enum + document owner access for task / task_comment.
-- Migration 0117. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0116.

ALTER TYPE public.task_activity_event_type ADD VALUE IF NOT EXISTS 'attachment_removed';

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
    RETURN app.uwm_user_can_read_task_id(p_owner_id);
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
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) TO authenticated, service_role;
