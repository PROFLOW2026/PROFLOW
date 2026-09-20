-- Universal Work Management: Task Comments + Task Activity log (append-only).
-- Migration N+6 (0102). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0101.

--------------------------------------------------------------------------------
-- 1. Enum: task_activity_event_type
--------------------------------------------------------------------------------

CREATE TYPE public.task_activity_event_type AS ENUM (
  'created',
  'status_changed',
  'bucket_changed',
  'assigned',
  'due_date_changed',
  'priority_changed',
  'comment_added',
  'attachment_added',
  'checklist_completed',
  'approval_result',
  'dependency_added',
  'dependency_removed',
  'completed',
  'reopened',
  'archived',
  'label_added',
  'recurrence_generated',
  'automation_changed',
  'system_generated'
);

--------------------------------------------------------------------------------
-- 2. task_comments (flat chronological — threading excluded)
--    Author: exactly one of author_org_member_id | author_employee_id.
--    Employee App sets author_employee_id only.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  author_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  author_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  body text NOT NULL,
  is_edited boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_comments_exactly_one_author CHECK (
    (author_org_member_id IS NOT NULL)::int + (author_employee_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON public.task_comments (task_id, created_at);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_comments_select ON public.task_comments;
CREATE POLICY task_comments_select ON public.task_comments
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_task_id(task_id));

DROP POLICY IF EXISTS task_comments_insert ON public.task_comments;
CREATE POLICY task_comments_insert ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_comment_task_id(task_id));

DROP POLICY IF EXISTS task_comments_update ON public.task_comments;
CREATE POLICY task_comments_update ON public.task_comments
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_comment_task_id(task_id))
  WITH CHECK (app.uwm_user_can_comment_task_id(task_id));

-- Soft-delete only — no hard delete for authenticated
DROP POLICY IF EXISTS task_comments_service_all ON public.task_comments;
CREATE POLICY task_comments_service_all ON public.task_comments AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. task_activity (append-only event log)
--    Actor: exactly one of actor_org_member_id | actor_employee_id | actor_system.
--    System events (recurrence, automation): actor_system = true.
--    Human events: org_member or employee fields only — never impersonate human.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  actor_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  actor_system boolean NOT NULL DEFAULT false,
  event_type public.task_activity_event_type NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_activity_exactly_one_actor CHECK (
    (actor_org_member_id IS NOT NULL)::int
    + (actor_employee_id IS NOT NULL)::int
    + actor_system::int = 1
  )
);

CREATE INDEX IF NOT EXISTS task_activity_task_idx ON public.task_activity (task_id, created_at);

-- Append-only: no UPDATE or DELETE for authenticated role
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_activity_select ON public.task_activity;
CREATE POLICY task_activity_select ON public.task_activity
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_task_id(task_id));

DROP POLICY IF EXISTS task_activity_insert ON public.task_activity;
CREATE POLICY task_activity_insert ON public.task_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    app.uwm_user_can_update_task_id(task_id)
    OR app.uwm_user_can_comment_task_id(task_id)
  );

-- No UPDATE/DELETE for authenticated — enforces append-only.

DROP POLICY IF EXISTS task_activity_service_all ON public.task_activity;
CREATE POLICY task_activity_service_all ON public.task_activity AS PERMISSIVE
  FOR ALL TO service_role USING (true);
