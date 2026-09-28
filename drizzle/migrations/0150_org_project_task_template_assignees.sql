-- 0150: Multi-default-assignee support for org project task templates.
-- PREPARED ONLY — Owner applies via npm run db:migrate after review.
-- Do not modify migrations 0000–0149.
--
-- Migrates existing default_assignee_employee_id values into
-- org_project_task_template_assignees, then drops the legacy column.

--------------------------------------------------------------------------------
-- 1. org_project_task_template_assignees
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_project_task_template_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_project_task_template_assignees
  DROP CONSTRAINT IF EXISTS org_project_task_template_assignees_template_org_fk;

ALTER TABLE public.org_project_task_template_assignees
  ADD CONSTRAINT org_project_task_template_assignees_template_org_fk
  FOREIGN KEY (template_id, organization_id)
  REFERENCES public.org_project_task_templates (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.org_project_task_template_assignees
  DROP CONSTRAINT IF EXISTS org_project_task_template_assignees_employee_org_fk;

ALTER TABLE public.org_project_task_template_assignees
  ADD CONSTRAINT org_project_task_template_assignees_employee_org_fk
  FOREIGN KEY (employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS org_project_task_template_assignees_template_employee_uq
  ON public.org_project_task_template_assignees (template_id, employee_id);

CREATE INDEX IF NOT EXISTS org_project_task_template_assignees_org_template_idx
  ON public.org_project_task_template_assignees (organization_id, template_id);

CREATE INDEX IF NOT EXISTS org_project_task_template_assignees_employee_idx
  ON public.org_project_task_template_assignees (employee_id, organization_id);

--------------------------------------------------------------------------------
-- 2. Backfill from legacy single-assignee column
--------------------------------------------------------------------------------

INSERT INTO public.org_project_task_template_assignees (template_id, organization_id, employee_id)
SELECT t.id, t.organization_id, t.default_assignee_employee_id
FROM public.org_project_task_templates t
WHERE t.default_assignee_employee_id IS NOT NULL
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- 3. Drop legacy column (no dual source of truth)
--------------------------------------------------------------------------------

ALTER TABLE public.org_project_task_templates
  DROP CONSTRAINT IF EXISTS org_project_task_templates_default_assignee_employee_org_fk;

ALTER TABLE public.org_project_task_templates
  DROP COLUMN IF EXISTS default_assignee_employee_id;

--------------------------------------------------------------------------------
-- 4. RLS + grants (consistent with org_project_task_templates management)
--------------------------------------------------------------------------------

ALTER TABLE public.org_project_task_template_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_project_task_template_assignees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_project_task_template_assignees_select ON public.org_project_task_template_assignees;
CREATE POLICY org_project_task_template_assignees_select ON public.org_project_task_template_assignees
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_project_task_template_assignees_insert ON public.org_project_task_template_assignees;
CREATE POLICY org_project_task_template_assignees_insert ON public.org_project_task_template_assignees
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS org_project_task_template_assignees_delete ON public.org_project_task_template_assignees;
CREATE POLICY org_project_task_template_assignees_delete ON public.org_project_task_template_assignees
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS org_project_task_template_assignees_service_all ON public.org_project_task_template_assignees;
CREATE POLICY org_project_task_template_assignees_service_all ON public.org_project_task_template_assignees AS PERMISSIVE
  FOR ALL TO service_role USING (true);

GRANT SELECT, INSERT, DELETE ON public.org_project_task_template_assignees TO authenticated;
GRANT ALL PRIVILEGES ON public.org_project_task_template_assignees TO service_role;
