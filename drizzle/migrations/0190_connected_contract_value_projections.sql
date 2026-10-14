-- 0190: Connected contract value projections (K08 / OD-15 Wave 2).
-- Pending journal (Gate B). Contractor-side read model; no cross-tenant writes from authenticated.

CREATE TABLE IF NOT EXISTS public.connected_contract_value_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL,
  contractor_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  contractor_project_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  amount_net numeric(18, 6) NOT NULL,
  currency char(3) NOT NULL,
  effective_date date NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connected_contract_value_projections_status_known
    CHECK (status IN ('active', 'superseded', 'void')),
  CONSTRAINT connected_contract_value_projections_idempotency_uq UNIQUE (idempotency_key),
  CONSTRAINT connected_contract_value_projections_amount_non_negative CHECK (amount_net >= 0)
);

CREATE INDEX IF NOT EXISTS connected_contract_value_projections_contractor_idx
  ON public.connected_contract_value_projections (contractor_organization_id, contractor_project_id, effective_date);

ALTER TABLE public.connected_contract_value_projections
  DROP CONSTRAINT IF EXISTS connected_contract_value_projections_mapping_contractor_fk;
ALTER TABLE public.connected_contract_value_projections
  ADD CONSTRAINT connected_contract_value_projections_mapping_contractor_fk
  FOREIGN KEY (mapping_id, contractor_organization_id)
  REFERENCES public.connected_project_mappings (id, contractor_organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.connected_contract_value_projections
  DROP CONSTRAINT IF EXISTS connected_contract_value_projections_project_org_fk;
ALTER TABLE public.connected_contract_value_projections
  ADD CONSTRAINT connected_contract_value_projections_project_org_fk
  FOREIGN KEY (contractor_project_id, contractor_organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.connected_contract_value_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_contract_value_projections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connected_contract_value_projections_contractor_select ON public.connected_contract_value_projections;
CREATE POLICY connected_contract_value_projections_contractor_select ON public.connected_contract_value_projections
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(contractor_organization_id)
    AND app.can_access_project(contractor_organization_id, contractor_project_id)
  );

DROP POLICY IF EXISTS connected_contract_value_projections_service_select ON public.connected_contract_value_projections;
CREATE POLICY connected_contract_value_projections_service_select ON public.connected_contract_value_projections
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS connected_contract_value_projections_service_insert ON public.connected_contract_value_projections;
CREATE POLICY connected_contract_value_projections_service_insert ON public.connected_contract_value_projections
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS connected_contract_value_projections_service_update ON public.connected_contract_value_projections;
CREATE POLICY connected_contract_value_projections_service_update ON public.connected_contract_value_projections
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.connected_contract_value_projections FROM authenticated;
REVOKE DELETE ON public.connected_contract_value_projections FROM service_role;
