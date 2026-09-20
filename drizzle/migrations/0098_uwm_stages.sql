-- Universal Work Management: Project Stage Definitions + immutable Stage Transitions.
-- Migration N+2 (0098). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0097.

--------------------------------------------------------------------------------
-- 1. project_stage_definitions
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_stage_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  -- Optional: only show for projects of this work_kind. NULL = all kinds.
  work_kind_filter text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_stage_definitions_work_kind_known CHECK (
    work_kind_filter IS NULL OR work_kind_filter IN ('project', 'job', 'work_order')
  )
);

CREATE INDEX IF NOT EXISTS project_stage_definitions_org_idx
  ON public.project_stage_definitions (organization_id);

ALTER TABLE public.project_stage_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stage_definitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_stage_definitions_select ON public.project_stage_definitions;
CREATE POLICY project_stage_definitions_select ON public.project_stage_definitions
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS project_stage_definitions_insert ON public.project_stage_definitions;
CREATE POLICY project_stage_definitions_insert ON public.project_stage_definitions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'stages.manage')
  );

DROP POLICY IF EXISTS project_stage_definitions_update ON public.project_stage_definitions;
CREATE POLICY project_stage_definitions_update ON public.project_stage_definitions
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'stages.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'stages.manage')
  );

DROP POLICY IF EXISTS project_stage_definitions_delete ON public.project_stage_definitions;
CREATE POLICY project_stage_definitions_delete ON public.project_stage_definitions
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'stages.manage')
  );

DROP POLICY IF EXISTS project_stage_definitions_service_all ON public.project_stage_definitions;
CREATE POLICY project_stage_definitions_service_all ON public.project_stage_definitions AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 2. project_stage_transitions (immutable history)
--    Current stage = latest row ORDER BY transitioned_at DESC, id DESC.
--    Initial stage: from_stage_id = NULL.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.project_stage_definitions (id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES public.project_stage_definitions (id) ON DELETE RESTRICT,
  transitioned_at timestamptz NOT NULL DEFAULT now(),
  transitioned_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  notes text
);

-- Current-stage lookup index (deterministic tie-break on id)
CREATE INDEX IF NOT EXISTS project_stage_transitions_current_idx
  ON public.project_stage_transitions (project_id, transitioned_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS project_stage_transitions_org_idx
  ON public.project_stage_transitions (organization_id);

-- Append-only enforcement: UPDATE and DELETE revoked for authenticated role
ALTER TABLE public.project_stage_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stage_transitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_stage_transitions_select ON public.project_stage_transitions;
CREATE POLICY project_stage_transitions_select ON public.project_stage_transitions
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
  );

DROP POLICY IF EXISTS project_stage_transitions_insert ON public.project_stage_transitions;
CREATE POLICY project_stage_transitions_insert ON public.project_stage_transitions
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'stages.manage')
    AND app.can_access_project(organization_id, project_id)
  );

-- No UPDATE/DELETE policies for authenticated — append-only enforcement.

DROP POLICY IF EXISTS project_stage_transitions_service_all ON public.project_stage_transitions;
CREATE POLICY project_stage_transitions_service_all ON public.project_stage_transitions AS PERMISSIVE
  FOR ALL TO service_role USING (true);
