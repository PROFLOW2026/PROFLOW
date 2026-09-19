-- Universal Work Management: Task Boards + Task Buckets.
-- Migration N+3 (0099). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0098.

--------------------------------------------------------------------------------
-- 1. Enum: task_status (canonical — distinct from bucket)
--------------------------------------------------------------------------------

CREATE TYPE public.task_status AS ENUM (
  'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'
);

CREATE TYPE public.task_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

--------------------------------------------------------------------------------
-- 2. task_boards (multiple per workspace; one optional default)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_boards_workspace_idx
  ON public.task_boards (workspace_id, position);
CREATE INDEX IF NOT EXISTS task_boards_org_idx
  ON public.task_boards (organization_id);

ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_boards FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_boards_select ON public.task_boards;
CREATE POLICY task_boards_select ON public.task_boards
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_boards_insert ON public.task_boards;
CREATE POLICY task_boards_insert ON public.task_boards
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_boards_update ON public.task_boards;
CREATE POLICY task_boards_update ON public.task_boards
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_boards_delete ON public.task_boards;
CREATE POLICY task_boards_delete ON public.task_boards
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_boards_service_all ON public.task_boards;
CREATE POLICY task_boards_service_all ON public.task_boards AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. task_buckets (configurable columns; status_on_enter nullable)
--    Bucket ≠ canonical status.
--    NULL status_on_enter = no automatic status change on bucket move.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.task_boards (id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Lexorank string for stable drag/drop ordering
  sort_key text NOT NULL,
  color text,
  wip_limit integer,
  -- When set, moving a task into this bucket applies this canonical status automatically.
  status_on_enter public.task_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_buckets_board_idx
  ON public.task_buckets (board_id, sort_key);

ALTER TABLE public.task_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_buckets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_buckets_select ON public.task_buckets;
CREATE POLICY task_buckets_select ON public.task_buckets
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_buckets_insert ON public.task_buckets;
CREATE POLICY task_buckets_insert ON public.task_buckets
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_buckets_update ON public.task_buckets;
CREATE POLICY task_buckets_update ON public.task_buckets
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_buckets_delete ON public.task_buckets;
CREATE POLICY task_buckets_delete ON public.task_buckets
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_buckets_service_all ON public.task_buckets;
CREATE POLICY task_buckets_service_all ON public.task_buckets AS PERMISSIVE
  FOR ALL TO service_role USING (true);
