-- Universal Work Management: Task Labels + Label Assignments.
-- Migration N+8 (0104). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0103.

CREATE TABLE IF NOT EXISTS public.task_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_labels_org_name_uq UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS task_labels_org_idx ON public.task_labels (organization_id);

ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_labels_select ON public.task_labels;
CREATE POLICY task_labels_select ON public.task_labels
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_labels_insert ON public.task_labels;
CREATE POLICY task_labels_insert ON public.task_labels
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_labels_update ON public.task_labels;
CREATE POLICY task_labels_update ON public.task_labels
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_labels_service_all ON public.task_labels;
CREATE POLICY task_labels_service_all ON public.task_labels AS PERMISSIVE
  FOR ALL TO service_role USING (true);

-- Label assignments
CREATE TABLE IF NOT EXISTS public.task_label_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.task_labels (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_label_assignments_uq UNIQUE (task_id, label_id)
);

CREATE INDEX IF NOT EXISTS task_label_assignments_task_idx ON public.task_label_assignments (task_id);
CREATE INDEX IF NOT EXISTS task_label_assignments_label_idx ON public.task_label_assignments (label_id);

ALTER TABLE public.task_label_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_label_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_label_assignments_select ON public.task_label_assignments;
CREATE POLICY task_label_assignments_select ON public.task_label_assignments
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_label_assignments_insert ON public.task_label_assignments;
CREATE POLICY task_label_assignments_insert ON public.task_label_assignments
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_label_assignments_update ON public.task_label_assignments;
CREATE POLICY task_label_assignments_update ON public.task_label_assignments
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_label_assignments_delete ON public.task_label_assignments;
CREATE POLICY task_label_assignments_delete ON public.task_label_assignments
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_label_assignments_service_all ON public.task_label_assignments;
CREATE POLICY task_label_assignments_service_all ON public.task_label_assignments AS PERMISSIVE
  FOR ALL TO service_role USING (true);
