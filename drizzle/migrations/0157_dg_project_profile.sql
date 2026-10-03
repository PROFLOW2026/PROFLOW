-- 0157: Developer / GC layer - Track D: project delivery profile, construction characteristics,
-- recommendation decisions. Locations use the foundation table project_locations (0155).
-- PREPARED ONLY - Owner applies after the Final Gate review. Do not modify 0000-0156.
--
-- PURPOSE
--   1. project_delivery_profiles (optional 1:1): operating roles (standard / developer /
--      general_contractor / project_management / subcontractor, any combination) + ownership
--      model. own_development / joint_venture need no client (projects.client_id is already
--      nullable and the create flow never requires it - no change to projects).
--   2. project_construction_characteristics (optional 1:1): category, method, counts, areas,
--      custom metadata. No money.
--   3. project_recommendation_decisions: accepted / dismissed rule-based recommendations.
--      UPDATE denied; only dismissed rows may be deleted (restore).
--
-- AUTHORIZATION (internal only; external principals never see these tables)
--   read  : app.has_project_capability(org, project, 'project.view')
--   write : profile -> 'project_settings.manage'; characteristics / decisions -> 'project.manage'
--
-- COMPATIBILITY: additive. Depends on 0154 (has_project_capability) and 0155.

--------------------------------------------------------------------------------
-- 1. project_delivery_profiles
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_delivery_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  operating_roles text[] NOT NULL DEFAULT '{}'::text[],
  ownership_model text NOT NULL DEFAULT 'client_project',
  developer_entity_name text,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_delivery_profiles_roles_known CHECK (
    operating_roles <@ ARRAY['developer','general_contractor','project_management','subcontractor']::text[]
  ),
  CONSTRAINT project_delivery_profiles_ownership_known CHECK (
    ownership_model IN ('client_project','own_development','joint_venture')
  ),
  CONSTRAINT project_delivery_profiles_ownership_requires_developer CHECK (
    ownership_model = 'client_project' OR 'developer' = ANY(operating_roles)
  )
);

ALTER TABLE public.project_delivery_profiles DROP CONSTRAINT IF EXISTS project_delivery_profiles_project_org_fk;
ALTER TABLE public.project_delivery_profiles
  ADD CONSTRAINT project_delivery_profiles_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_delivery_profiles_id_organization_id_uq
  ON public.project_delivery_profiles (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_delivery_profiles_project_uq
  ON public.project_delivery_profiles (organization_id, project_id);

--------------------------------------------------------------------------------
-- 2. project_construction_characteristics
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_construction_characteristics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  category text,
  construction_method text,
  buildings_count integer,
  floors_above_ground integer,
  floors_below_ground integer,
  residential_units integer,
  commercial_units integer,
  parking_levels integer,
  has_public_areas boolean NOT NULL DEFAULT false,
  built_area_sqm numeric(14, 2),
  commercial_area_sqm numeric(14, 2),
  common_area_sqm numeric(14, 2),
  site_area_sqm numeric(14, 2),
  custom_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_construction_characteristics_category_known CHECK (
    category IS NULL OR category IN ('residential','commercial','mixed_use','office','industrial',
      'public','infrastructure','renovation','urban_renewal','other')
  ),
  CONSTRAINT project_construction_characteristics_method_known CHECK (
    construction_method IS NULL OR construction_method IN ('cast_in_place','precast','tunnel_formwork',
      'steel_structure','timber','light_construction','mixed','other')
  ),
  CONSTRAINT project_construction_characteristics_counts_range CHECK (
    (buildings_count IS NULL OR buildings_count BETWEEN 0 AND 500)
    AND (floors_above_ground IS NULL OR floors_above_ground BETWEEN 0 AND 200)
    AND (floors_below_ground IS NULL OR floors_below_ground BETWEEN 0 AND 30)
    AND (residential_units IS NULL OR residential_units BETWEEN 0 AND 100000)
    AND (commercial_units IS NULL OR commercial_units BETWEEN 0 AND 100000)
    AND (parking_levels IS NULL OR parking_levels BETWEEN 0 AND 30)
  ),
  CONSTRAINT project_construction_characteristics_areas_non_negative CHECK (
    (built_area_sqm IS NULL OR built_area_sqm >= 0)
    AND (commercial_area_sqm IS NULL OR commercial_area_sqm >= 0)
    AND (common_area_sqm IS NULL OR common_area_sqm >= 0)
    AND (site_area_sqm IS NULL OR site_area_sqm >= 0)
  ),
  CONSTRAINT project_construction_characteristics_metadata_object CHECK (
    jsonb_typeof(custom_metadata) = 'object'
  )
);

ALTER TABLE public.project_construction_characteristics
  DROP CONSTRAINT IF EXISTS project_construction_characteristics_project_org_fk;
ALTER TABLE public.project_construction_characteristics
  ADD CONSTRAINT project_construction_characteristics_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_construction_characteristics_id_organization_id_uq
  ON public.project_construction_characteristics (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_construction_characteristics_project_uq
  ON public.project_construction_characteristics (organization_id, project_id);

--------------------------------------------------------------------------------
-- 3. project_recommendation_decisions
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_recommendation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  recommendation_key text NOT NULL,
  kind text NOT NULL,
  decision text NOT NULL,
  ruleset_version text NOT NULL,
  created_entity_type text,
  created_entity_id uuid,
  decided_actor_type text NOT NULL DEFAULT 'internal',
  decided_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_recommendation_decisions_key_shape CHECK (
    recommendation_key ~ '^[a-z][a-z_]*:[a-z0-9_:]+$'
  ),
  CONSTRAINT project_recommendation_decisions_kind_known CHECK (
    kind IN ('trade','work_package','milestone','coordination_event','inspection',
      'handover_requirement','task_template')
  ),
  CONSTRAINT project_recommendation_decisions_decision_known CHECK (decision IN ('accepted','dismissed')),
  CONSTRAINT project_recommendation_decisions_created_entity_shape CHECK (
    (decision = 'accepted' AND created_entity_type IN ('work_package','project_milestone','task')
      AND created_entity_id IS NOT NULL)
    OR (decision = 'dismissed' AND created_entity_type IS NULL AND created_entity_id IS NULL)
  ),
  CONSTRAINT project_recommendation_decisions_actor_shape CHECK (
    (decided_actor_type = 'internal' AND decided_principal_id IS NULL)
    OR (decided_actor_type = 'external' AND decided_principal_id IS NOT NULL AND decided_user_id IS NULL)
    OR (decided_actor_type = 'system' AND decided_user_id IS NULL AND decided_principal_id IS NULL)
  )
);

ALTER TABLE public.project_recommendation_decisions
  DROP CONSTRAINT IF EXISTS project_recommendation_decisions_project_org_fk;
ALTER TABLE public.project_recommendation_decisions
  ADD CONSTRAINT project_recommendation_decisions_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_recommendation_decisions_key_uq
  ON public.project_recommendation_decisions (organization_id, project_id, recommendation_key);
CREATE INDEX IF NOT EXISTS project_recommendation_decisions_project_idx
  ON public.project_recommendation_decisions (organization_id, project_id);

-- Decisions are facts: never updated; an accepted decision is never deleted
-- (project cascade deletes are allowed: the whole project is gone).
CREATE OR REPLACE FUNCTION app.project_recommendation_decisions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'project_recommendation_decisions are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.decision = 'accepted' AND EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = OLD.project_id AND p.organization_id = OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'accepted recommendation decisions cannot be deleted' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS project_recommendation_decisions_guard ON public.project_recommendation_decisions;
CREATE TRIGGER project_recommendation_decisions_guard
  BEFORE UPDATE OR DELETE ON public.project_recommendation_decisions
  FOR EACH ROW EXECUTE FUNCTION app.project_recommendation_decisions_guard();

--------------------------------------------------------------------------------
-- 4. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.project_delivery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_delivery_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_construction_characteristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_construction_characteristics FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_recommendation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_recommendation_decisions FORCE ROW LEVEL SECURITY;

-- project_delivery_profiles: project.view reads; project_settings.manage writes; no delete.
DROP POLICY IF EXISTS project_delivery_profiles_select ON public.project_delivery_profiles;
CREATE POLICY project_delivery_profiles_select ON public.project_delivery_profiles
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS project_delivery_profiles_insert ON public.project_delivery_profiles;
CREATE POLICY project_delivery_profiles_insert ON public.project_delivery_profiles
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_settings.manage'));
DROP POLICY IF EXISTS project_delivery_profiles_update ON public.project_delivery_profiles;
CREATE POLICY project_delivery_profiles_update ON public.project_delivery_profiles
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_settings.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project_settings.manage'));
DROP POLICY IF EXISTS project_delivery_profiles_service_all ON public.project_delivery_profiles;
CREATE POLICY project_delivery_profiles_service_all ON public.project_delivery_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- project_construction_characteristics: project.view reads; project.manage writes; no delete.
DROP POLICY IF EXISTS project_construction_characteristics_select ON public.project_construction_characteristics;
CREATE POLICY project_construction_characteristics_select ON public.project_construction_characteristics
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS project_construction_characteristics_insert ON public.project_construction_characteristics;
CREATE POLICY project_construction_characteristics_insert ON public.project_construction_characteristics
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'));
DROP POLICY IF EXISTS project_construction_characteristics_update ON public.project_construction_characteristics;
CREATE POLICY project_construction_characteristics_update ON public.project_construction_characteristics
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'));
DROP POLICY IF EXISTS project_construction_characteristics_service_all ON public.project_construction_characteristics;
CREATE POLICY project_construction_characteristics_service_all ON public.project_construction_characteristics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- project_recommendation_decisions: project.view reads; project.manage appends as itself;
-- project.manage deletes dismissed rows only (trigger blocks accepted).
DROP POLICY IF EXISTS project_recommendation_decisions_select ON public.project_recommendation_decisions;
CREATE POLICY project_recommendation_decisions_select ON public.project_recommendation_decisions
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view'));
DROP POLICY IF EXISTS project_recommendation_decisions_insert ON public.project_recommendation_decisions;
CREATE POLICY project_recommendation_decisions_insert ON public.project_recommendation_decisions
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage')
    AND decided_actor_type = 'internal'
    AND decided_user_id = app.current_user_id());
DROP POLICY IF EXISTS project_recommendation_decisions_delete ON public.project_recommendation_decisions;
CREATE POLICY project_recommendation_decisions_delete ON public.project_recommendation_decisions
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage')
    AND decision = 'dismissed');
DROP POLICY IF EXISTS project_recommendation_decisions_service_all ON public.project_recommendation_decisions;
CREATE POLICY project_recommendation_decisions_service_all ON public.project_recommendation_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.project_delivery_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.project_construction_characteristics TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.project_recommendation_decisions TO authenticated;
GRANT ALL PRIVILEGES ON public.project_delivery_profiles TO service_role;
GRANT ALL PRIVILEGES ON public.project_construction_characteristics TO service_role;
GRANT ALL PRIVILEGES ON public.project_recommendation_decisions TO service_role;
