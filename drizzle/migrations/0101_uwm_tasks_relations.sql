-- Universal Work Management: Task Dependencies + Task Followers.
-- Migration N+5 (0101). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0100.

--------------------------------------------------------------------------------
-- 1. Enum: task_dependency_type
--------------------------------------------------------------------------------

CREATE TYPE public.task_dependency_type AS ENUM ('finish_to_start', 'blocked_by');

--------------------------------------------------------------------------------
-- 2. task_dependencies
--    Cycle prevention enforced in domain (DFS before insert).
--    No auto-cascade date reschedule — deterministic signal only.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  source_task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  target_task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  dependency_type public.task_dependency_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_dependencies_edge_uq UNIQUE (source_task_id, target_task_id, dependency_type),
  CONSTRAINT task_dependencies_no_self CHECK (source_task_id <> target_task_id)
);

CREATE INDEX IF NOT EXISTS task_dependencies_source_idx ON public.task_dependencies (source_task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_target_idx ON public.task_dependencies (target_task_id);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_dependencies_select ON public.task_dependencies;
CREATE POLICY task_dependencies_select ON public.task_dependencies
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_dependencies_insert ON public.task_dependencies;
CREATE POLICY task_dependencies_insert ON public.task_dependencies
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_dependencies_update ON public.task_dependencies;
CREATE POLICY task_dependencies_update ON public.task_dependencies
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_dependencies_delete ON public.task_dependencies;
CREATE POLICY task_dependencies_delete ON public.task_dependencies
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_dependencies_service_all ON public.task_dependencies;
CREATE POLICY task_dependencies_service_all ON public.task_dependencies AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. task_followers (org members watching a task for notifications)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_member_id uuid NOT NULL REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_followers_uq UNIQUE (task_id, org_member_id)
);

CREATE INDEX IF NOT EXISTS task_followers_task_idx ON public.task_followers (task_id);

ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_followers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_followers_select ON public.task_followers;
CREATE POLICY task_followers_select ON public.task_followers
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_followers_insert ON public.task_followers;
CREATE POLICY task_followers_insert ON public.task_followers
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_followers_update ON public.task_followers;
CREATE POLICY task_followers_update ON public.task_followers
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_followers_delete ON public.task_followers;
CREATE POLICY task_followers_delete ON public.task_followers
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_followers_service_all ON public.task_followers;
CREATE POLICY task_followers_service_all ON public.task_followers AS PERMISSIVE
  FOR ALL TO service_role USING (true);
