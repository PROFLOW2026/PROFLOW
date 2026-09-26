-- 0132: Material Market Monitor V1 — global market pressure data (no org scope).
-- Migration after 0131. Do not modify migrations 0000–0131.
-- Additive only. No backfill in SQL — use scripts/material-market-bootstrap.ts.
--
-- GLOBAL DATA RATIONALE
-- CBS/FRED market series are national/global, not tenant-specific. All orgs share
-- the same public indices. Tenant isolation is enforced at read time: only users
-- with org role permission materials.read (owner RBAC via role_assignments) may
-- SELECT. Employee-app grants (employee_permission_grants) do not satisfy this gate.
--
-- DO NOT APPLY without explicit Owner approval.

CREATE TABLE IF NOT EXISTS public.material_market_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_he text NOT NULL,
  trade text,
  source_type text NOT NULL,
  source_name text NOT NULL,
  source_series_id text,
  source_url text,
  frequency text NOT NULL DEFAULT 'monthly',
  unit text,
  currency text,
  is_active boolean NOT NULL DEFAULT true,
  is_derived boolean NOT NULL DEFAULT false,
  last_observation_date date,
  last_refresh_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_market_sources_code_uq UNIQUE (code),
  CONSTRAINT material_market_sources_trade_known CHECK (
    trade IS NULL OR trade IN ('electrical', 'plumbing', 'steel_rebar')
  ),
  CONSTRAINT material_market_sources_source_type_known CHECK (
    source_type IN ('fred', 'cbs', 'derived')
  )
);

CREATE INDEX IF NOT EXISTS material_market_sources_active_idx
  ON public.material_market_sources (is_active, code);

CREATE TABLE IF NOT EXISTS public.material_market_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.material_market_sources (id) ON DELETE CASCADE,
  observation_date date NOT NULL,
  value numeric(18, 6) NOT NULL,
  open numeric(18, 6),
  high numeric(18, 6),
  low numeric(18, 6),
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_market_observations_source_date_uq UNIQUE (source_id, observation_date)
);

CREATE INDEX IF NOT EXISTS material_market_observations_source_date_idx
  ON public.material_market_observations (source_id, observation_date DESC);

CREATE TABLE IF NOT EXISTS public.material_pressure_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade text NOT NULL,
  snapshot_date date NOT NULL,
  pressure_score numeric(6, 2) NOT NULL,
  pressure_direction text NOT NULL,
  confidence text NOT NULL,
  pressure_score_1m_change numeric(6, 2),
  pressure_score_3m_change numeric(6, 2),
  pressure_momentum text NOT NULL,
  local_confirmation text NOT NULL,
  weighted_data_coverage numeric(6, 4) NOT NULL,
  components_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  drivers_up_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  drivers_down_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  methodology_version text NOT NULL DEFAULT 'V1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_pressure_snapshots_trade_date_version_uq
    UNIQUE (trade, snapshot_date, methodology_version),
  CONSTRAINT material_pressure_snapshots_trade_known CHECK (
    trade IN ('electrical', 'plumbing', 'steel_rebar')
  ),
  CONSTRAINT material_pressure_snapshots_direction_known CHECK (
    pressure_direction IN ('strong_down', 'down', 'neutral', 'up', 'strong_up')
  ),
  CONSTRAINT material_pressure_snapshots_confidence_known CHECK (
    confidence IN ('low', 'medium', 'high')
  ),
  CONSTRAINT material_pressure_snapshots_momentum_known CHECK (
    pressure_momentum IN ('rising_fast', 'rising', 'stable', 'falling', 'falling_fast')
  ),
  CONSTRAINT material_pressure_snapshots_local_confirmation_known CHECK (
    local_confirmation IN ('confirmed_up', 'confirmed_down', 'not_confirmed', 'no_local_data')
  ),
  CONSTRAINT material_pressure_snapshots_score_range CHECK (
    pressure_score >= 0 AND pressure_score <= 100
  ),
  CONSTRAINT material_pressure_snapshots_coverage_range CHECK (
    weighted_data_coverage >= 0 AND weighted_data_coverage <= 1
  )
);

CREATE INDEX IF NOT EXISTS material_pressure_snapshots_trade_date_idx
  ON public.material_pressure_snapshots (trade, snapshot_date DESC);

ALTER TABLE public.material_market_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_market_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.material_market_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_market_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.material_pressure_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_pressure_snapshots FORCE ROW LEVEL SECURITY;

-- Owner RBAC only (role_assignments). Employee-app grants cannot read global market data.
DROP POLICY IF EXISTS material_market_sources_select ON public.material_market_sources;
CREATE POLICY material_market_sources_select ON public.material_market_sources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.user_id = app.current_user_id()
        AND m.status = 'active'
        AND app.has_org_permission(m.organization_id, 'materials.read')
    )
  );

DROP POLICY IF EXISTS material_market_observations_select ON public.material_market_observations;
CREATE POLICY material_market_observations_select ON public.material_market_observations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.user_id = app.current_user_id()
        AND m.status = 'active'
        AND app.has_org_permission(m.organization_id, 'materials.read')
    )
  );

DROP POLICY IF EXISTS material_pressure_snapshots_select ON public.material_pressure_snapshots;
CREATE POLICY material_pressure_snapshots_select ON public.material_pressure_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.user_id = app.current_user_id()
        AND m.status = 'active'
        AND app.has_org_permission(m.organization_id, 'materials.read')
    )
  );

DROP POLICY IF EXISTS material_market_sources_service_all ON public.material_market_sources;
CREATE POLICY material_market_sources_service_all ON public.material_market_sources
  AS PERMISSIVE
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS material_market_observations_service_all ON public.material_market_observations;
CREATE POLICY material_market_observations_service_all ON public.material_market_observations
  AS PERMISSIVE
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS material_pressure_snapshots_service_all ON public.material_pressure_snapshots;
CREATE POLICY material_pressure_snapshots_service_all ON public.material_pressure_snapshots
  AS PERMISSIVE
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.material_market_sources TO authenticated;
GRANT SELECT ON public.material_market_observations TO authenticated;
GRANT SELECT ON public.material_pressure_snapshots TO authenticated;
