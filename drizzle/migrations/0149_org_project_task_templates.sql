-- 0149: Organization project task templates — auto-create tasks on new projects.
-- PREPARED ONLY — Owner applies via npm run db:migrate after review.
-- Do not modify migrations 0000–0148.
--
-- Tenant integrity:
--   * default_assignee composite FK → employees(id, organization_id)
--     ON DELETE SET NULL (default_assignee_employee_id) — organization_id stays NOT NULL
--   * task provenance composite FK → org_project_task_templates(id, organization_id)
--     ON DELETE RESTRICT — hard-delete blocked while generated tasks exist
-- Authenticated: SELECT, INSERT, UPDATE only (no DELETE; archive/disable lifecycle).

--------------------------------------------------------------------------------
-- 1. org_project_task_templates
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.org_project_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  default_assignee_employee_id uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_project_task_templates_id_organization_id_uq
  ON public.org_project_task_templates (id, organization_id);

CREATE INDEX IF NOT EXISTS org_project_task_templates_org_idx
  ON public.org_project_task_templates (organization_id, position);

CREATE INDEX IF NOT EXISTS org_project_task_templates_org_active_idx
  ON public.org_project_task_templates (organization_id)
  WHERE is_archived = false AND is_enabled = true;

ALTER TABLE public.org_project_task_templates
  DROP CONSTRAINT IF EXISTS org_project_task_templates_default_assignee_employee_org_fk;

ALTER TABLE public.org_project_task_templates
  ADD CONSTRAINT org_project_task_templates_default_assignee_employee_org_fk
  FOREIGN KEY (default_assignee_employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE SET NULL (default_assignee_employee_id);

ALTER TABLE public.org_project_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_project_task_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_project_task_templates_select ON public.org_project_task_templates;
CREATE POLICY org_project_task_templates_select ON public.org_project_task_templates
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS org_project_task_templates_insert ON public.org_project_task_templates;
CREATE POLICY org_project_task_templates_insert ON public.org_project_task_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS org_project_task_templates_update ON public.org_project_task_templates;
CREATE POLICY org_project_task_templates_update ON public.org_project_task_templates
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS org_project_task_templates_service_all ON public.org_project_task_templates;
CREATE POLICY org_project_task_templates_service_all ON public.org_project_task_templates AS PERMISSIVE
  FOR ALL TO service_role USING (true);

GRANT SELECT, INSERT, UPDATE ON public.org_project_task_templates TO authenticated;
GRANT ALL PRIVILEGES ON public.org_project_task_templates TO service_role;

--------------------------------------------------------------------------------
-- 2. Task provenance for idempotent template instantiation
--------------------------------------------------------------------------------

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS generated_from_org_project_task_template_id uuid;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_generated_org_project_task_template_org_fk;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_generated_org_project_task_template_org_fk
  FOREIGN KEY (generated_from_org_project_task_template_id, organization_id)
  REFERENCES public.org_project_task_templates (id, organization_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_org_project_task_template_unique
  ON public.tasks (project_id, generated_from_org_project_task_template_id)
  WHERE generated_from_org_project_task_template_id IS NOT NULL
    AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_org_project_task_template_idx
  ON public.tasks (organization_id, generated_from_org_project_task_template_id)
  WHERE generated_from_org_project_task_template_id IS NOT NULL;
