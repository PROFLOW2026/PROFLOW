-- Universal Work Management: Core tasks table + task_assignees + task_checklist_items.
-- Migration N+4 (0100). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0099.

--------------------------------------------------------------------------------
-- 1. Additional task enums
--------------------------------------------------------------------------------

CREATE TYPE public.task_source AS ENUM (
  'manual', 'template', 'automation', 'meeting_action', 'recurrence'
);

--------------------------------------------------------------------------------
-- 2. tasks (canonical PM task entity)
--
--    tasks.project_id = authoritative project attribution (explicit context).
--    NULL = workspace-wide task not attributed to a single project.
--    Validated against project_workspace_links(workspace_id, project_id) in domain.
--
--    Creator CHECK: exactly one of created_by_org_member_id | created_by_employee_id | created_by_system.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  board_id uuid REFERENCES public.task_boards (id) ON DELETE SET NULL,
  bucket_id uuid REFERENCES public.task_buckets (id) ON DELETE SET NULL,

  -- Authoritative project context (NOT workspace membership denormalization)
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,

  title text NOT NULL,
  description text,

  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'none',

  start_date date,
  due_date date,
  completion_date date,

  -- Creator: exactly one of org_member | employee | system
  created_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  created_by_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_by_system boolean NOT NULL DEFAULT false,

  -- Owner (human only — never system)
  owner_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  owner_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,

  estimated_effort_minutes integer,

  -- Subtask (max 2 levels enforced in domain)
  parent_task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,

  -- Lexorank for stable drag/drop ordering within bucket
  sort_key text NOT NULL DEFAULT 'a',

  milestone_id uuid REFERENCES public.project_milestones (id) ON DELETE SET NULL,
  recurrence_rule_id uuid, -- FK added in 0103 when recurrence table exists
  generated_from_occurrence_id uuid, -- FK added in 0103

  source public.task_source NOT NULL DEFAULT 'manual',
  approval_required boolean NOT NULL DEFAULT false,

  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  completed_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  completed_by_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tasks_creator_exactly_one CHECK (
    (created_by_org_member_id IS NOT NULL)::int
    + (created_by_employee_id IS NOT NULL)::int
    + (created_by_system)::int = 1
  ),
  CONSTRAINT tasks_owner_at_most_one CHECK (
    (owner_org_member_id IS NOT NULL)::int + (owner_employee_id IS NOT NULL)::int <= 1
  )
);

-- Critical indexes for My Work, Portfolio rollup, board queries
CREATE INDEX IF NOT EXISTS tasks_org_workspace_idx ON public.tasks (organization_id, workspace_id);
CREATE INDEX IF NOT EXISTS tasks_project_context_idx
  ON public.tasks (project_id, status, due_date) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_org_project_idx
  ON public.tasks (organization_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_due_date_idx
  ON public.tasks (organization_id, due_date) WHERE status NOT IN ('done', 'cancelled');
CREATE INDEX IF NOT EXISTS tasks_bucket_idx ON public.tasks (bucket_id, sort_key);
CREATE INDEX IF NOT EXISTS tasks_parent_idx ON public.tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks (organization_id, created_by_org_member_id);
CREATE INDEX IF NOT EXISTS tasks_portfolio_rollup_idx
  ON public.tasks (organization_id, workspace_id, status, due_date);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_workspace_context_fk
  FOREIGN KEY (workspace_id, project_id)
  REFERENCES public.project_workspace_links (workspace_id, project_id)
  ON DELETE RESTRICT;

--------------------------------------------------------------------------------
-- Task authorization helpers (org path; employee scope completed in §3b)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.uwm_can_read_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_has_tasks_read(p_organization_id) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_has_workspace_content_access(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN app.has_org_permission(p_organization_id, 'tasks.read')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_create_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_has_workspace_content_access(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN app.has_org_permission(p_organization_id, 'tasks.create')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_update_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN app.has_org_permission(p_organization_id, 'tasks.update')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_delete_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN app.has_org_permission(p_organization_id, 'tasks.delete')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_assign_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN app.has_org_permission(p_organization_id, 'tasks.assign')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_comment_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN app.has_org_permission(p_organization_id, 'tasks.comment')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all');
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_read_task_id(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_read_task(
        t.organization_id, t.workspace_id, t.project_id, t.id
      )
      FROM public.tasks t
      WHERE t.id = p_task_id
    ),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_update_task_id(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_update_task(
        t.organization_id, t.workspace_id, t.project_id, t.id
      )
      FROM public.tasks t
      WHERE t.id = p_task_id
    ),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_delete_task_id(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_delete_task(
        t.organization_id, t.workspace_id, t.project_id, t.id
      )
      FROM public.tasks t
      WHERE t.id = p_task_id
    ),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_assign_task_id(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_assign_task(
        t.organization_id, t.workspace_id, t.project_id, t.id
      )
      FROM public.tasks t
      WHERE t.id = p_task_id
    ),
    false
  );
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_user_can_comment_task_id(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT app.uwm_can_comment_task(
        t.organization_id, t.workspace_id, t.project_id, t.id
      )
      FROM public.tasks t
      WHERE t.id = p_task_id
    ),
    false
  );
$fn$;

REVOKE ALL ON FUNCTION app.uwm_can_read_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_create_task(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_update_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_delete_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_assign_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_can_comment_task(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_read_task_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_update_task_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_delete_task_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_assign_task_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_user_can_comment_task_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.uwm_can_read_task(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_create_task(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_update_task(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_delete_task(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_assign_task(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_can_comment_task(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_read_task_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_update_task_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_delete_task_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_assign_task_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_user_can_comment_task_id(uuid) TO authenticated, service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (app.uwm_can_read_task(organization_id, workspace_id, project_id, id));

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_can_create_task(organization_id, workspace_id, project_id));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (app.uwm_can_update_task(organization_id, workspace_id, project_id, id))
  WITH CHECK (app.uwm_can_update_task(organization_id, workspace_id, project_id, id));

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (app.uwm_can_delete_task(organization_id, workspace_id, project_id, id));

DROP POLICY IF EXISTS tasks_service_all ON public.tasks;
CREATE POLICY tasks_service_all ON public.tasks AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. task_assignees (multi-assignee; exactly one of org_member | employee)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  CONSTRAINT task_assignees_exactly_one_actor CHECK (
    (org_member_id IS NOT NULL)::int + (employee_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS task_assignees_task_idx ON public.task_assignees (task_id);
CREATE INDEX IF NOT EXISTS task_assignees_org_member_idx ON public.task_assignees (org_member_id, task_id);
CREATE INDEX IF NOT EXISTS task_assignees_employee_idx ON public.task_assignees (employee_id, task_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_assignees_select ON public.task_assignees;
CREATE POLICY task_assignees_select ON public.task_assignees
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_task_id(task_id));

DROP POLICY IF EXISTS task_assignees_insert ON public.task_assignees;
CREATE POLICY task_assignees_insert ON public.task_assignees
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_assign_task_id(task_id));

DROP POLICY IF EXISTS task_assignees_update ON public.task_assignees;
CREATE POLICY task_assignees_update ON public.task_assignees
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_assign_task_id(task_id))
  WITH CHECK (app.uwm_user_can_assign_task_id(task_id));

DROP POLICY IF EXISTS task_assignees_delete ON public.task_assignees;
CREATE POLICY task_assignees_delete ON public.task_assignees
  FOR DELETE TO authenticated
  USING (app.uwm_user_can_assign_task_id(task_id));

DROP POLICY IF EXISTS task_assignees_service_all ON public.task_assignees;
CREATE POLICY task_assignees_service_all ON public.task_assignees AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3b. Employee App scope-aware task authorization (requires task_assignees)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.uwm_employee_scope_allows_task(
  p_organization_id uuid,
  p_scope public.permission_scope,
  p_task_id uuid,
  p_project_id uuid,
  p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_scope = 'all_organization' THEN
    RETURN true;
  END IF;

  IF p_scope = 'self_only' THEN
    IF p_task_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.task_assignees ta
      WHERE ta.task_id = p_task_id
        AND ta.employee_id = p_employee_id
    );
  END IF;

  IF p_project_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN app.uwm_employee_project_assignment_is_current(
    p_organization_id, p_employee_id, p_project_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_employee_can_exercise_task_permission(
  p_organization_id uuid,
  p_permission_key text,
  p_task_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_employee uuid;
  v_scope public.permission_scope;
  v_manage_scope public.permission_scope;
BEGIN
  v_employee := app.linked_employee_id(p_organization_id);
  IF v_employee IS NULL THEN
    RETURN false;
  END IF;

  v_scope := app.employee_permission_scope(p_organization_id, p_permission_key);
  IF v_scope IS NOT NULL THEN
    RETURN app.uwm_employee_scope_allows_task(
      p_organization_id, v_scope, p_task_id, p_project_id, v_employee
    );
  END IF;

  IF p_permission_key <> 'tasks.manage_all' THEN
    v_manage_scope := app.employee_permission_scope(p_organization_id, 'tasks.manage_all');
    IF v_manage_scope IS NOT NULL THEN
      RETURN app.uwm_employee_scope_allows_task(
        p_organization_id, v_manage_scope, p_task_id, p_project_id, v_employee
      );
    END IF;
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_read_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_has_workspace_content_access(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  -- Org role permissions take precedence over linked-employee scoped grants.
  IF app.has_org_permission(p_organization_id, 'tasks.read')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    RETURN true;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.read', p_task_id, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_create_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_has_workspace_content_access(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.has_org_permission(p_organization_id, 'tasks.create')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    RETURN true;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.create', NULL, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_update_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.has_org_permission(p_organization_id, 'tasks.update')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    RETURN true;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.update', p_task_id, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_delete_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.has_org_permission(p_organization_id, 'tasks.delete')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    RETURN true;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.delete', p_task_id, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_assign_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.has_org_permission(p_organization_id, 'tasks.assign')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    RETURN true;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.assign', p_task_id, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.uwm_can_comment_task(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_task_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.uwm_can_read_task(
    p_organization_id, p_workspace_id, p_project_id, p_task_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_workspace_allows_contribute(
    p_organization_id, p_workspace_id, p_project_id
  ) THEN
    RETURN false;
  END IF;

  IF NOT app.uwm_task_context_is_mutable(p_workspace_id, p_project_id) THEN
    RETURN false;
  END IF;

  IF app.has_org_permission(p_organization_id, 'tasks.comment')
      OR app.has_org_permission(p_organization_id, 'tasks.manage_all') THEN
    RETURN true;
  END IF;

  IF app.linked_employee_id(p_organization_id) IS NOT NULL THEN
    RETURN app.uwm_employee_can_exercise_task_permission(
      p_organization_id, 'tasks.comment', p_task_id, p_project_id
    );
  END IF;

  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.uwm_employee_scope_allows_task(uuid, public.permission_scope, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.uwm_employee_can_exercise_task_permission(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.uwm_employee_scope_allows_task(uuid, public.permission_scope, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.uwm_employee_can_exercise_task_permission(uuid, text, uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 4. task_checklist_items
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  sort_key text NOT NULL,
  due_date date,
  assignee_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  assignee_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_checklist_items_assignee_at_most_one CHECK (
    (assignee_org_member_id IS NOT NULL)::int + (assignee_employee_id IS NOT NULL)::int <= 1
  )
);

CREATE INDEX IF NOT EXISTS task_checklist_items_task_idx
  ON public.task_checklist_items (task_id, sort_key);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_checklist_items_select ON public.task_checklist_items;
CREATE POLICY task_checklist_items_select ON public.task_checklist_items
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_task_id(task_id));

DROP POLICY IF EXISTS task_checklist_items_insert ON public.task_checklist_items;
CREATE POLICY task_checklist_items_insert ON public.task_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_update_task_id(task_id));

DROP POLICY IF EXISTS task_checklist_items_update ON public.task_checklist_items;
CREATE POLICY task_checklist_items_update ON public.task_checklist_items
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_update_task_id(task_id))
  WITH CHECK (app.uwm_user_can_update_task_id(task_id));

DROP POLICY IF EXISTS task_checklist_items_delete ON public.task_checklist_items;
CREATE POLICY task_checklist_items_delete ON public.task_checklist_items
  FOR DELETE TO authenticated
  USING (app.uwm_user_can_update_task_id(task_id));

DROP POLICY IF EXISTS task_checklist_items_service_all ON public.task_checklist_items;
CREATE POLICY task_checklist_items_service_all ON public.task_checklist_items AS PERMISSIVE
  FOR ALL TO service_role USING (true);
