-- 0116: UWM task reminders (user-set due-date reminders).
-- Migration after 0115. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0115.

--------------------------------------------------------------------------------
-- 1. Enum: task_reminder_type
--------------------------------------------------------------------------------

CREATE TYPE public.task_reminder_type AS ENUM ('on_due', 'day_before', 'custom');

--------------------------------------------------------------------------------
-- 2. task_reminders
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  reminder_type public.task_reminder_type NOT NULL,
  remind_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_reminders_task_type_uq UNIQUE (task_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS task_reminders_org_remind_idx
  ON public.task_reminders (organization_id, remind_at);

CREATE INDEX IF NOT EXISTS task_reminders_task_idx
  ON public.task_reminders (task_id);

ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_reminders_select ON public.task_reminders;
CREATE POLICY task_reminders_select ON public.task_reminders
  FOR SELECT TO authenticated
  USING (app.uwm_user_can_read_task_id(task_id));

DROP POLICY IF EXISTS task_reminders_insert ON public.task_reminders;
CREATE POLICY task_reminders_insert ON public.task_reminders
  FOR INSERT TO authenticated
  WITH CHECK (app.uwm_user_can_update_task_id(task_id));

DROP POLICY IF EXISTS task_reminders_update ON public.task_reminders;
CREATE POLICY task_reminders_update ON public.task_reminders
  FOR UPDATE TO authenticated
  USING (app.uwm_user_can_update_task_id(task_id))
  WITH CHECK (app.uwm_user_can_update_task_id(task_id));

DROP POLICY IF EXISTS task_reminders_delete ON public.task_reminders;
CREATE POLICY task_reminders_delete ON public.task_reminders
  FOR DELETE TO authenticated
  USING (app.uwm_user_can_update_task_id(task_id));

DROP POLICY IF EXISTS task_reminders_service_all ON public.task_reminders;
CREATE POLICY task_reminders_service_all ON public.task_reminders AS PERMISSIVE
  FOR ALL TO service_role USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_reminders TO authenticated;
