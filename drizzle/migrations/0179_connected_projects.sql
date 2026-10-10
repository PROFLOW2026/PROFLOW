-- 0179: Connected ProjectFlow organizations (Mode B) — invitations, mappings, sync outbox, claim cash projections.
-- PREPARED ONLY — Owner applies after review. Purely additive.
--
-- PURPOSE: Developer issues hashed connection codes; contractor org links a project to a developer
-- subcontract engagement. Certified claim NET amounts project into contractor cash-flow forecasts.
--
-- DATA MUTATION: none
-- SCHEMA MUTATION: four new tables + supporting unique indexes + RLS

-- Composite FK target for cross-org payable basis references.
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_claim_payable_bases_id_organization_id_uq
  ON public.subcontract_claim_payable_bases (id, organization_id);

--------------------------------------------------------------------------------
-- 1. engagement_connection_invitations (developer tenant only in RLS)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.engagement_connection_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  developer_project_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  issued_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  consumed_by_organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL,
  consumed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_connection_invitations_status_known
    CHECK (status IN ('issued', 'consumed', 'revoked', 'expired')),
  CONSTRAINT engagement_connection_invitations_code_hash_shape
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT engagement_connection_invitations_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT engagement_connection_invitations_single_use
    CHECK (
      (consumed_at IS NULL AND status <> 'consumed')
      OR (consumed_at IS NOT NULL AND status = 'consumed')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS engagement_connection_invitations_code_hash_uq
  ON public.engagement_connection_invitations (code_hash);
CREATE INDEX IF NOT EXISTS engagement_connection_invitations_dev_org_project_idx
  ON public.engagement_connection_invitations (developer_organization_id, developer_project_id);
CREATE INDEX IF NOT EXISTS engagement_connection_invitations_agreement_idx
  ON public.engagement_connection_invitations (developer_organization_id, subcontract_agreement_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS engagement_connection_invitations_one_open_per_agreement_uq
  ON public.engagement_connection_invitations (developer_organization_id, subcontract_agreement_id)
  WHERE status = 'issued' AND revoked_at IS NULL AND consumed_at IS NULL;

ALTER TABLE public.engagement_connection_invitations
  DROP CONSTRAINT IF EXISTS engagement_connection_invitations_project_org_fk;
ALTER TABLE public.engagement_connection_invitations
  ADD CONSTRAINT engagement_connection_invitations_project_org_fk
  FOREIGN KEY (developer_project_id, developer_organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.engagement_connection_invitations
  DROP CONSTRAINT IF EXISTS engagement_connection_invitations_agreement_org_fk;
ALTER TABLE public.engagement_connection_invitations
  ADD CONSTRAINT engagement_connection_invitations_agreement_org_fk
  FOREIGN KEY (subcontract_agreement_id, developer_organization_id)
  REFERENCES public.subcontract_agreements_store (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.engagement_connection_invitations
  DROP CONSTRAINT IF EXISTS engagement_connection_invitations_vendor_org_fk;
ALTER TABLE public.engagement_connection_invitations
  ADD CONSTRAINT engagement_connection_invitations_vendor_org_fk
  FOREIGN KEY (vendor_id, developer_organization_id)
  REFERENCES public.vendors (id, organization_id) ON DELETE RESTRICT;

--------------------------------------------------------------------------------
-- 2. connected_project_mappings
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.connected_project_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES public.engagement_connection_invitations (id) ON DELETE SET NULL,
  developer_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  developer_project_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  contractor_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  contractor_project_id uuid,
  contractor_client_id uuid,
  status text NOT NULL DEFAULT 'pending',
  connection_version integer NOT NULL DEFAULT 1,
  provisioning_status text NOT NULL DEFAULT 'not_started',
  accepted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connected_project_mappings_status_known
    CHECK (status IN ('pending', 'provisioning', 'active', 'failed', 'revoked')),
  CONSTRAINT connected_project_mappings_provisioning_status_known
    CHECK (provisioning_status IN ('not_started', 'in_progress', 'succeeded', 'failed')),
  CONSTRAINT connected_project_mappings_orgs_distinct
    CHECK (developer_organization_id <> contractor_organization_id),
  CONSTRAINT connected_project_mappings_connection_version_positive
    CHECK (connection_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS connected_project_mappings_id_developer_org_uq
  ON public.connected_project_mappings (id, developer_organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS connected_project_mappings_id_contractor_org_uq
  ON public.connected_project_mappings (id, contractor_organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS connected_project_mappings_contractor_project_uq
  ON public.connected_project_mappings (contractor_project_id)
  WHERE contractor_project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS connected_project_mappings_agreement_contractor_active_uq
  ON public.connected_project_mappings (developer_organization_id, subcontract_agreement_id, contractor_organization_id)
  WHERE status IN ('pending', 'provisioning', 'active');
CREATE INDEX IF NOT EXISTS connected_project_mappings_developer_idx
  ON public.connected_project_mappings (developer_organization_id, developer_project_id, status);
CREATE INDEX IF NOT EXISTS connected_project_mappings_contractor_idx
  ON public.connected_project_mappings (contractor_organization_id, contractor_project_id, status);

ALTER TABLE public.connected_project_mappings
  DROP CONSTRAINT IF EXISTS connected_project_mappings_dev_project_org_fk;
ALTER TABLE public.connected_project_mappings
  ADD CONSTRAINT connected_project_mappings_dev_project_org_fk
  FOREIGN KEY (developer_project_id, developer_organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.connected_project_mappings
  DROP CONSTRAINT IF EXISTS connected_project_mappings_dev_agreement_org_fk;
ALTER TABLE public.connected_project_mappings
  ADD CONSTRAINT connected_project_mappings_dev_agreement_org_fk
  FOREIGN KEY (subcontract_agreement_id, developer_organization_id)
  REFERENCES public.subcontract_agreements_store (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.connected_project_mappings
  DROP CONSTRAINT IF EXISTS connected_project_mappings_contractor_project_org_fk;
ALTER TABLE public.connected_project_mappings
  ADD CONSTRAINT connected_project_mappings_contractor_project_org_fk
  FOREIGN KEY (contractor_project_id, contractor_organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE SET NULL;

--------------------------------------------------------------------------------
-- 3. cross_org_sync_outbox (worker / service_role)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cross_org_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL REFERENCES public.connected_project_mappings (id) ON DELETE CASCADE,
  developer_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cross_org_sync_outbox_status_known
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  CONSTRAINT cross_org_sync_outbox_attempts_non_negative
    CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS cross_org_sync_outbox_idempotency_key_uq
  ON public.cross_org_sync_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS cross_org_sync_outbox_pending_idx
  ON public.cross_org_sync_outbox (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS cross_org_sync_outbox_mapping_idx
  ON public.cross_org_sync_outbox (mapping_id, created_at);

ALTER TABLE public.cross_org_sync_outbox
  DROP CONSTRAINT IF EXISTS cross_org_sync_outbox_mapping_dev_org_fk;
ALTER TABLE public.cross_org_sync_outbox
  ADD CONSTRAINT cross_org_sync_outbox_mapping_dev_org_fk
  FOREIGN KEY (mapping_id, developer_organization_id)
  REFERENCES public.connected_project_mappings (id, developer_organization_id) ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- 4. connected_claim_cash_projections (contractor tenant reads; worker writes)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.connected_claim_cash_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL REFERENCES public.connected_project_mappings (id) ON DELETE CASCADE,
  contractor_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  contractor_project_id uuid NOT NULL,
  developer_organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  developer_claim_id uuid NOT NULL,
  developer_payable_basis_id uuid NOT NULL,
  certified_net numeric(18, 6) NOT NULL,
  retention_net numeric(18, 6) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL,
  expected_receipt_date date,
  certainty text NOT NULL DEFAULT 'confirmed',
  status text NOT NULL DEFAULT 'active',
  source_version integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connected_claim_cash_projections_status_known
    CHECK (status IN ('active', 'superseded', 'void')),
  CONSTRAINT connected_claim_cash_projections_certainty_known
    CHECK (certainty IN ('confirmed', 'estimated')),
  CONSTRAINT connected_claim_cash_projections_certified_non_negative
    CHECK (certified_net >= 0),
  CONSTRAINT connected_claim_cash_projections_retention_non_negative
    CHECK (retention_net >= 0),
  CONSTRAINT connected_claim_cash_projections_source_version_positive
    CHECK (source_version >= 1),
  CONSTRAINT connected_claim_cash_projections_currency_upper
    CHECK (currency = upper(currency))
);

CREATE UNIQUE INDEX IF NOT EXISTS connected_claim_cash_projections_idempotency_key_uq
  ON public.connected_claim_cash_projections (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS connected_claim_cash_projections_mapping_basis_uq
  ON public.connected_claim_cash_projections (mapping_id, developer_payable_basis_id);
CREATE INDEX IF NOT EXISTS connected_claim_cash_projections_contractor_project_idx
  ON public.connected_claim_cash_projections (contractor_organization_id, contractor_project_id, status);

ALTER TABLE public.connected_claim_cash_projections
  DROP CONSTRAINT IF EXISTS connected_claim_cash_projections_mapping_contractor_org_fk;
ALTER TABLE public.connected_claim_cash_projections
  ADD CONSTRAINT connected_claim_cash_projections_mapping_contractor_org_fk
  FOREIGN KEY (mapping_id, contractor_organization_id)
  REFERENCES public.connected_project_mappings (id, contractor_organization_id) ON DELETE CASCADE;

ALTER TABLE public.connected_claim_cash_projections
  DROP CONSTRAINT IF EXISTS connected_claim_cash_projections_contractor_project_org_fk;
ALTER TABLE public.connected_claim_cash_projections
  ADD CONSTRAINT connected_claim_cash_projections_contractor_project_org_fk
  FOREIGN KEY (contractor_project_id, contractor_organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.connected_claim_cash_projections
  DROP CONSTRAINT IF EXISTS connected_claim_cash_projections_dev_claim_org_fk;
ALTER TABLE public.connected_claim_cash_projections
  ADD CONSTRAINT connected_claim_cash_projections_dev_claim_org_fk
  FOREIGN KEY (developer_claim_id, developer_organization_id)
  REFERENCES public.subcontract_claims (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE public.connected_claim_cash_projections
  DROP CONSTRAINT IF EXISTS connected_claim_cash_projections_dev_payable_basis_org_fk;
ALTER TABLE public.connected_claim_cash_projections
  ADD CONSTRAINT connected_claim_cash_projections_dev_payable_basis_org_fk
  FOREIGN KEY (developer_payable_basis_id, developer_organization_id)
  REFERENCES public.subcontract_claim_payable_bases (id, organization_id) ON DELETE RESTRICT;

--------------------------------------------------------------------------------
-- 5. RLS + grants (strict org isolation; no cross-org authenticated reads)
--------------------------------------------------------------------------------

ALTER TABLE public.engagement_connection_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_connection_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connected_project_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_project_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cross_org_sync_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_org_sync_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connected_claim_cash_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_claim_cash_projections FORCE ROW LEVEL SECURITY;

-- Invitations: developer managers only (mirrors external_principal_tokens / contractor-access).
DROP POLICY IF EXISTS engagement_connection_invitations_developer_select ON public.engagement_connection_invitations;
CREATE POLICY engagement_connection_invitations_developer_select ON public.engagement_connection_invitations
  FOR SELECT TO authenticated
  USING (
    app.can_manage_contractor_access(developer_organization_id, developer_project_id)
  );

-- Inserts / consumes / revokes run server-side as service_role (no authenticated DML on secrets).

DROP POLICY IF EXISTS engagement_connection_invitations_developer_insert ON public.engagement_connection_invitations;
DROP POLICY IF EXISTS engagement_connection_invitations_developer_update ON public.engagement_connection_invitations;

DROP POLICY IF EXISTS engagement_connection_invitations_service_all ON public.engagement_connection_invitations;
CREATE POLICY engagement_connection_invitations_service_all ON public.engagement_connection_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Mappings: each org sees only its side of the link (same row, disjoint policies).
DROP POLICY IF EXISTS connected_project_mappings_developer_select ON public.connected_project_mappings;
CREATE POLICY connected_project_mappings_developer_select ON public.connected_project_mappings
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(developer_organization_id)
    AND app.can_access_project(developer_organization_id, developer_project_id)
  );

-- Mapping rows are written only by trusted server paths (accept / provision / revoke).

DROP POLICY IF EXISTS connected_project_mappings_developer_write ON public.connected_project_mappings;

DROP POLICY IF EXISTS connected_project_mappings_contractor_select ON public.connected_project_mappings;
CREATE POLICY connected_project_mappings_contractor_select ON public.connected_project_mappings
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(contractor_organization_id)
    AND contractor_project_id IS NOT NULL
    AND app.can_access_project(contractor_organization_id, contractor_project_id)
  );

DROP POLICY IF EXISTS connected_project_mappings_service_all ON public.connected_project_mappings;
CREATE POLICY connected_project_mappings_service_all ON public.connected_project_mappings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Outbox + projection delivery: trusted worker only at DB layer.
DROP POLICY IF EXISTS cross_org_sync_outbox_service_all ON public.cross_org_sync_outbox;
CREATE POLICY cross_org_sync_outbox_service_all ON public.cross_org_sync_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS connected_claim_cash_projections_contractor_select ON public.connected_claim_cash_projections;
CREATE POLICY connected_claim_cash_projections_contractor_select ON public.connected_claim_cash_projections
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(contractor_organization_id)
    AND app.can_access_project(contractor_organization_id, contractor_project_id)
  );

DROP POLICY IF EXISTS connected_claim_cash_projections_service_all ON public.connected_claim_cash_projections;
CREATE POLICY connected_claim_cash_projections_service_all ON public.connected_claim_cash_projections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.engagement_connection_invitations FROM authenticated;
GRANT SELECT ON public.engagement_connection_invitations TO authenticated;
GRANT ALL PRIVILEGES ON public.engagement_connection_invitations TO service_role;

REVOKE ALL ON public.connected_project_mappings FROM authenticated;
GRANT SELECT ON public.connected_project_mappings TO authenticated;
GRANT ALL PRIVILEGES ON public.connected_project_mappings TO service_role;

REVOKE ALL ON public.cross_org_sync_outbox FROM authenticated;
GRANT ALL PRIVILEGES ON public.cross_org_sync_outbox TO service_role;

REVOKE ALL ON public.connected_claim_cash_projections FROM authenticated;
GRANT SELECT ON public.connected_claim_cash_projections TO authenticated;
GRANT ALL PRIVILEGES ON public.connected_claim_cash_projections TO service_role;
