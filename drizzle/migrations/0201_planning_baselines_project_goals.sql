-- 0201_planning_baselines_project_goals.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without a separate Owner approval.
-- Immutable schedule baselines + project goals (EXLFY wave 4 foundations).

CREATE TABLE IF NOT EXISTS public.planning_schedule_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  label text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planning_schedule_baselines_project_idx
  ON public.planning_schedule_baselines (organization_id, project_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_schedule_baselines_project_org_fk'
  ) THEN
    ALTER TABLE public.planning_schedule_baselines
      ADD CONSTRAINT planning_schedule_baselines_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Composite FK parent: id + organization_id + project_id (before child baseline snapshot FK).
CREATE UNIQUE INDEX IF NOT EXISTS planning_schedule_baselines_id_org_project_uq
  ON public.planning_schedule_baselines (id, organization_id, project_id);

CREATE TABLE IF NOT EXISTS public.planning_schedule_baseline_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_schedule_baseline_snapshots_items_is_array CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT planning_schedule_baseline_snapshots_one_per_baseline UNIQUE (baseline_id)
);

CREATE INDEX IF NOT EXISTS planning_schedule_baseline_snapshots_project_idx
  ON public.planning_schedule_baseline_snapshots (organization_id, project_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_schedule_baseline_snapshots_project_org_fk'
  ) THEN
    ALTER TABLE public.planning_schedule_baseline_snapshots
      ADD CONSTRAINT planning_schedule_baseline_snapshots_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_schedule_baseline_snapshots_baseline_org_project_fk'
  ) THEN
    ALTER TABLE public.planning_schedule_baseline_snapshots
      ADD CONSTRAINT planning_schedule_baseline_snapshots_baseline_org_project_fk
      FOREIGN KEY (baseline_id, organization_id, project_id)
      REFERENCES public.planning_schedule_baselines (id, organization_id, project_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.planning_schedule_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_schedule_baselines FORCE ROW LEVEL SECURITY;

ALTER TABLE public.planning_schedule_baseline_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_schedule_baseline_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_schedule_baselines_select ON public.planning_schedule_baselines;
CREATE POLICY planning_schedule_baselines_select ON public.planning_schedule_baselines
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'planning.read')
  );

DROP POLICY IF EXISTS planning_schedule_baselines_insert ON public.planning_schedule_baselines;
CREATE POLICY planning_schedule_baselines_insert ON public.planning_schedule_baselines
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'planning.write')
    AND created_by_user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS planning_schedule_baselines_service_all ON public.planning_schedule_baselines;
CREATE POLICY planning_schedule_baselines_service_all ON public.planning_schedule_baselines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS planning_schedule_baseline_snapshots_select ON public.planning_schedule_baseline_snapshots;
CREATE POLICY planning_schedule_baseline_snapshots_select ON public.planning_schedule_baseline_snapshots
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'planning.read')
  );

DROP POLICY IF EXISTS planning_schedule_baseline_snapshots_insert ON public.planning_schedule_baseline_snapshots;
CREATE POLICY planning_schedule_baseline_snapshots_insert ON public.planning_schedule_baseline_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'planning.write')
    AND EXISTS (
      SELECT 1
      FROM public.planning_schedule_baselines b
      WHERE b.id = baseline_id
        AND b.organization_id = planning_schedule_baseline_snapshots.organization_id
        AND b.project_id = planning_schedule_baseline_snapshots.project_id
    )
  );

DROP POLICY IF EXISTS planning_schedule_baseline_snapshots_service_all ON public.planning_schedule_baseline_snapshots;
CREATE POLICY planning_schedule_baseline_snapshots_service_all ON public.planning_schedule_baseline_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.project_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  title text NOT NULL,
  owner_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  due_on date,
  status text NOT NULL DEFAULT 'not_started',
  progress_percent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_goals_title_nonempty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT project_goals_progress_range CHECK (progress_percent BETWEEN 0 AND 100),
  CONSTRAINT project_goals_status_known CHECK (
    status IN ('not_started', 'in_progress', 'completed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS project_goals_project_idx
  ON public.project_goals (organization_id, project_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_goals_project_org_fk'
  ) THEN
    ALTER TABLE public.project_goals
      ADD CONSTRAINT project_goals_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.project_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_goals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_goals_select ON public.project_goals;
CREATE POLICY project_goals_select ON public.project_goals
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

DROP POLICY IF EXISTS project_goals_insert ON public.project_goals;
CREATE POLICY project_goals_insert ON public.project_goals
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND (
      app.has_org_permission(organization_id, 'projects.update')
      OR app.has_org_permission(organization_id, 'planning.write')
    )
  );

DROP POLICY IF EXISTS project_goals_update ON public.project_goals;
CREATE POLICY project_goals_update ON public.project_goals
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND (
      app.has_org_permission(organization_id, 'projects.update')
      OR app.has_org_permission(organization_id, 'planning.write')
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND (
      app.has_org_permission(organization_id, 'projects.update')
      OR app.has_org_permission(organization_id, 'planning.write')
    )
  );

DROP POLICY IF EXISTS project_goals_delete ON public.project_goals;
CREATE POLICY project_goals_delete ON public.project_goals
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND (
      app.has_org_permission(organization_id, 'projects.update')
      OR app.has_org_permission(organization_id, 'planning.write')
    )
  );

DROP POLICY IF EXISTS project_goals_service_all ON public.project_goals;
CREATE POLICY project_goals_service_all ON public.project_goals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON public.planning_schedule_baselines TO authenticated;
GRANT SELECT, INSERT ON public.planning_schedule_baseline_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_goals TO authenticated;

GRANT ALL ON public.planning_schedule_baselines TO service_role;
GRANT ALL ON public.planning_schedule_baseline_snapshots TO service_role;
GRANT ALL ON public.project_goals TO service_role;
