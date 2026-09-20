-- Universal Work Management: Task Templates + Project Templates.
-- Migration N+9 (0105). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0104.

--------------------------------------------------------------------------------
-- 1. task_templates (reusable single-task definition)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority public.task_priority NOT NULL DEFAULT 'none',
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_templates_org_idx ON public.task_templates (organization_id);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_templates_select ON public.task_templates;
CREATE POLICY task_templates_select ON public.task_templates
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_templates_insert ON public.task_templates;
CREATE POLICY task_templates_insert ON public.task_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS task_templates_update ON public.task_templates;
CREATE POLICY task_templates_update ON public.task_templates
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS task_templates_service_all ON public.task_templates;
CREATE POLICY task_templates_service_all ON public.task_templates AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 2. task_template_items (checklist items within a task template)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.task_templates (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_key text NOT NULL
);

CREATE INDEX IF NOT EXISTS task_template_items_template_idx ON public.task_template_items (template_id);

ALTER TABLE public.task_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_template_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_template_items_select ON public.task_template_items;
CREATE POLICY task_template_items_select ON public.task_template_items
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_template_items_insert ON public.task_template_items;
CREATE POLICY task_template_items_insert ON public.task_template_items
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS task_template_items_update ON public.task_template_items;
CREATE POLICY task_template_items_update ON public.task_template_items
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'task_templates.manage')
  );

DROP POLICY IF EXISTS task_template_items_service_all ON public.task_template_items;
CREATE POLICY task_template_items_service_all ON public.task_template_items AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. project_templates
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  org_profile_type text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_templates_org_idx ON public.project_templates (organization_id);

ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_templates_select ON public.project_templates;
CREATE POLICY project_templates_select ON public.project_templates
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS project_templates_insert ON public.project_templates;
CREATE POLICY project_templates_insert ON public.project_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  );

DROP POLICY IF EXISTS project_templates_update ON public.project_templates;
CREATE POLICY project_templates_update ON public.project_templates
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  );

DROP POLICY IF EXISTS project_templates_service_all ON public.project_templates;
CREATE POLICY project_templates_service_all ON public.project_templates AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 4. project_template_stages
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.project_templates (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text
);

CREATE INDEX IF NOT EXISTS project_template_stages_template_idx ON public.project_template_stages (template_id);

ALTER TABLE public.project_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_stages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_template_stages_select ON public.project_template_stages;
CREATE POLICY project_template_stages_select ON public.project_template_stages
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS project_template_stages_insert ON public.project_template_stages;
CREATE POLICY project_template_stages_insert ON public.project_template_stages
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  );

DROP POLICY IF EXISTS project_template_stages_update ON public.project_template_stages;
CREATE POLICY project_template_stages_update ON public.project_template_stages
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  );

DROP POLICY IF EXISTS project_template_stages_service_all ON public.project_template_stages;
CREATE POLICY project_template_stages_service_all ON public.project_template_stages AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 5. project_template_tasks
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.project_templates (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.project_template_stages (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority public.task_priority NOT NULL DEFAULT 'none',
  due_date_offset_days integer,
  sort_key text NOT NULL
);

CREATE INDEX IF NOT EXISTS project_template_tasks_template_idx ON public.project_template_tasks (template_id);

ALTER TABLE public.project_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_template_tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_template_tasks_select ON public.project_template_tasks;
CREATE POLICY project_template_tasks_select ON public.project_template_tasks
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS project_template_tasks_insert ON public.project_template_tasks;
CREATE POLICY project_template_tasks_insert ON public.project_template_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  );

DROP POLICY IF EXISTS project_template_tasks_update ON public.project_template_tasks;
CREATE POLICY project_template_tasks_update ON public.project_template_tasks
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'project_templates.manage')
  );

DROP POLICY IF EXISTS project_template_tasks_service_all ON public.project_template_tasks;
CREATE POLICY project_template_tasks_service_all ON public.project_template_tasks AS PERMISSIVE
  FOR ALL TO service_role USING (true);
