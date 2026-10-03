-- 0167: Track Q — contractor tender/award, agreement closeout/handover, warranty links, performance metrics.
-- PREPARED ONLY. Depends on 0154/0155 and promoted DG slots through 0166.
-- NO customer-quote tables. Bid money lives in contractor_tender_offer_financials (financial projection).

--------------------------------------------------------------------------------
-- 1. contractor_tender_packages
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_tender_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  work_package_id uuid,
  trade_key text NOT NULL,
  title text NOT NULL,
  scope_description text,
  status text NOT NULL DEFAULT 'draft',
  awarded_vendor_id uuid,
  awarded_agreement_id uuid,
  awarded_at timestamptz,
  awarded_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_tender_packages_trade_not_blank CHECK (length(btrim(trade_key)) > 0),
  CONSTRAINT contractor_tender_packages_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT contractor_tender_packages_status_known CHECK (status IN (
    'draft', 'inviting', 'evaluating', 'awarded', 'cancelled')),
  CONSTRAINT contractor_tender_packages_award_shape CHECK (
    (status <> 'awarded' AND awarded_vendor_id IS NULL AND awarded_agreement_id IS NULL AND awarded_at IS NULL)
    OR (status = 'awarded' AND awarded_vendor_id IS NOT NULL AND awarded_agreement_id IS NOT NULL AND awarded_at IS NOT NULL)),
  CONSTRAINT contractor_tender_packages_project_org_fk
    FOREIGN KEY (project_id, organization_id)
    REFERENCES public.projects (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT contractor_tender_packages_wp_project_fk
    FOREIGN KEY (work_package_id, organization_id, project_id)
    REFERENCES public.work_packages (id, organization_id, project_id) ON DELETE SET NULL,
  CONSTRAINT contractor_tender_packages_awarded_vendor_fk
    FOREIGN KEY (awarded_vendor_id, organization_id)
    REFERENCES public.vendors (id, organization_id) ON DELETE SET NULL,
  CONSTRAINT contractor_tender_packages_awarded_agreement_fk
    FOREIGN KEY (awarded_agreement_id, organization_id, awarded_vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_tender_packages_id_org_uq
  ON public.contractor_tender_packages (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_tender_packages_id_org_project_uq
  ON public.contractor_tender_packages (id, organization_id, project_id);
CREATE INDEX IF NOT EXISTS contractor_tender_packages_project_idx
  ON public.contractor_tender_packages (organization_id, project_id, status)
  WHERE archived_at IS NULL;

--------------------------------------------------------------------------------
-- 2. contractor_tender_invitations
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_tender_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  package_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'invited',
  invited_at timestamptz NOT NULL DEFAULT now(),
  invited_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT contractor_tender_invitations_status_known CHECK (status IN ('invited', 'declined', 'submitted')),
  CONSTRAINT contractor_tender_invitations_package_fk
    FOREIGN KEY (package_id, organization_id, project_id)
    REFERENCES public.contractor_tender_packages (id, organization_id, project_id) ON DELETE CASCADE,
  CONSTRAINT contractor_tender_invitations_vendor_org_fk
    FOREIGN KEY (vendor_id, organization_id)
    REFERENCES public.vendors (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_tender_invitations_id_org_uq
  ON public.contractor_tender_invitations (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_tender_invitations_scope_uq
  ON public.contractor_tender_invitations (id, organization_id, project_id, package_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS contractor_tender_invitations_package_vendor_uq
  ON public.contractor_tender_invitations (organization_id, package_id, vendor_id);
CREATE INDEX IF NOT EXISTS contractor_tender_invitations_vendor_idx
  ON public.contractor_tender_invitations (organization_id, vendor_id, status);

--------------------------------------------------------------------------------
-- 3. contractor_tender_offers (operational — no money)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_tender_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  package_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  submitted_actor_type text NOT NULL DEFAULT 'external',
  submitted_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  submitted_at timestamptz,
  CONSTRAINT contractor_tender_offers_status_known CHECK (status IN (
    'draft', 'submitted', 'withdrawn', 'selected', 'rejected')),
  CONSTRAINT contractor_tender_offers_actor_shape CHECK (
    (submitted_actor_type = 'internal' AND submitted_by_principal_id IS NULL)
    OR (submitted_actor_type = 'external' AND submitted_by_principal_id IS NOT NULL AND submitted_by_user_id IS NULL)
    OR (submitted_actor_type = 'system' AND submitted_by_user_id IS NULL AND submitted_by_principal_id IS NULL)),
  CONSTRAINT contractor_tender_offers_submit_shape CHECK (
    (status = 'draft' AND submitted_at IS NULL)
    OR (status IN ('submitted', 'withdrawn', 'selected', 'rejected') AND submitted_at IS NOT NULL)),
  CONSTRAINT contractor_tender_offers_package_fk
    FOREIGN KEY (package_id, organization_id, project_id)
    REFERENCES public.contractor_tender_packages (id, organization_id, project_id) ON DELETE CASCADE,
  CONSTRAINT contractor_tender_offers_invitation_fk
    FOREIGN KEY (invitation_id, organization_id)
    REFERENCES public.contractor_tender_invitations (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_tender_offers_id_org_uq
  ON public.contractor_tender_offers (id, organization_id);
CREATE INDEX IF NOT EXISTS contractor_tender_offers_package_idx
  ON public.contractor_tender_offers (organization_id, package_id, status);

--------------------------------------------------------------------------------
-- 4. contractor_tender_offer_financials (money — financial cap only)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_tender_offer_financials (
  offer_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  bid_amount numeric(18, 2) NOT NULL,
  currency text NOT NULL,
  lead_time_days integer,
  valid_until date,
  CONSTRAINT contractor_tender_offer_financials_positive CHECK (bid_amount >= 0),
  CONSTRAINT contractor_tender_offer_financials_offer_fk
    FOREIGN KEY (offer_id, organization_id)
    REFERENCES public.contractor_tender_offers (id, organization_id) ON DELETE CASCADE
);

--------------------------------------------------------------------------------
-- 5. subcontract_agreement_closeouts
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_agreement_closeouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  close_override_reason text,
  close_override_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  close_override_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_agreement_closeouts_status_known CHECK (status IN ('open', 'ready', 'closed')),
  CONSTRAINT subcontract_agreement_closeouts_closed_shape CHECK (
    (status <> 'closed' AND closed_at IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL)),
  CONSTRAINT subcontract_agreement_closeouts_override_reason CHECK (
    close_override_reason IS NULL OR length(btrim(close_override_reason)) > 0),
  CONSTRAINT subcontract_agreement_closeouts_agreement_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreement_closeouts_id_org_uq
  ON public.subcontract_agreement_closeouts (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreement_closeouts_id_org_project_uq
  ON public.subcontract_agreement_closeouts (id, organization_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreement_closeouts_agreement_uq
  ON public.subcontract_agreement_closeouts (organization_id, subcontract_agreement_id);

--------------------------------------------------------------------------------
-- 6. subcontract_closeout_checklist_items
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_closeout_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  closeout_id uuid NOT NULL,
  item_kind text NOT NULL,
  title text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  document_id uuid,
  notes text,
  completed_at timestamptz,
  completed_actor_type text,
  completed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  completed_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  waive_reason text,
  waived_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  waived_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT subcontract_closeout_items_kind_known CHECK (item_kind IN (
    'punch_list_clear', 'final_claim', 'final_invoice', 'as_built', 'om_manuals',
    'warranties_registered', 'certificates', 'inspections_complete', 'training_complete',
    'final_account', 'retention_release', 'guarantees', 'custom')),
  CONSTRAINT subcontract_closeout_items_status_known CHECK (status IN (
    'pending', 'submitted', 'complete', 'waived')),
  CONSTRAINT subcontract_closeout_items_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT subcontract_closeout_items_closeout_fk
    FOREIGN KEY (closeout_id, organization_id, project_id)
    REFERENCES public.subcontract_agreement_closeouts (id, organization_id, project_id) ON DELETE CASCADE,
  CONSTRAINT subcontract_closeout_items_document_fk
    FOREIGN KEY (document_id, organization_id)
    REFERENCES public.documents (id, organization_id) ON DELETE SET NULL (document_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_closeout_items_id_org_uq
  ON public.subcontract_closeout_checklist_items (id, organization_id);
CREATE INDEX IF NOT EXISTS subcontract_closeout_items_closeout_idx
  ON public.subcontract_closeout_checklist_items (organization_id, closeout_id, sort_order);

--------------------------------------------------------------------------------
-- 7. contractor_warranty_reports (defect link via entity_links, not FK to quality)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_warranty_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  warranty_coverage_id uuid,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'open',
  reported_actor_type text NOT NULL DEFAULT 'internal',
  reported_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reported_by_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  retention_flag boolean NOT NULL DEFAULT false,
  guarantee_flag boolean NOT NULL DEFAULT false,
  CONSTRAINT contractor_warranty_reports_status_known CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
  CONSTRAINT contractor_warranty_reports_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT contractor_warranty_reports_agreement_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE,
  CONSTRAINT contractor_warranty_reports_coverage_fk
    FOREIGN KEY (warranty_coverage_id, organization_id, project_id)
    REFERENCES public.warranty_coverages (id, organization_id, project_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_warranty_reports_id_org_uq
  ON public.contractor_warranty_reports (id, organization_id);
CREATE INDEX IF NOT EXISTS contractor_warranty_reports_agreement_idx
  ON public.contractor_warranty_reports (organization_id, subcontract_agreement_id, status);

--------------------------------------------------------------------------------
-- 8. contractor_performance_snapshots (factual metrics, documented formula)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contractor_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  subcontract_agreement_id uuid NOT NULL,
  formula_version text NOT NULL DEFAULT 'q-v1',
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  CONSTRAINT contractor_performance_snapshots_agreement_fk
    FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
    REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS contractor_performance_snapshots_id_org_uq
  ON public.contractor_performance_snapshots (id, organization_id);
CREATE INDEX IF NOT EXISTS contractor_performance_snapshots_agreement_idx
  ON public.contractor_performance_snapshots (organization_id, subcontract_agreement_id, computed_at DESC);

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

ALTER TABLE public.contractor_tender_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_offers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_offer_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_tender_offer_financials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_agreement_closeouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_agreement_closeouts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_closeout_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_closeout_checklist_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_warranty_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_warranty_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_performance_snapshots FORCE ROW LEVEL SECURITY;

-- Packages: internal project.view; external invited vendor sees package via invitation + ext.bid.submit
DROP POLICY IF EXISTS contractor_tender_packages_select ON public.contractor_tender_packages;
CREATE POLICY contractor_tender_packages_select ON public.contractor_tender_packages
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.contractor_tender_invitations i
      WHERE i.package_id = contractor_tender_packages.id
        AND i.organization_id = contractor_tender_packages.organization_id
        AND app.external_has_scope(i.organization_id, i.project_id, i.vendor_id, NULL, 'ext.bid.submit'))
  );

DROP POLICY IF EXISTS contractor_tender_packages_write ON public.contractor_tender_packages;
CREATE POLICY contractor_tender_packages_write ON public.contractor_tender_packages
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));

DROP POLICY IF EXISTS contractor_tender_packages_service_all ON public.contractor_tender_packages;
CREATE POLICY contractor_tender_packages_service_all ON public.contractor_tender_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Invitations
DROP POLICY IF EXISTS contractor_tender_invitations_select ON public.contractor_tender_invitations;
CREATE POLICY contractor_tender_invitations_select ON public.contractor_tender_invitations
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.bid.submit')
  );

DROP POLICY IF EXISTS contractor_tender_invitations_write ON public.contractor_tender_invitations;
CREATE POLICY contractor_tender_invitations_write ON public.contractor_tender_invitations
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));

DROP POLICY IF EXISTS contractor_tender_invitations_service_all ON public.contractor_tender_invitations;
CREATE POLICY contractor_tender_invitations_service_all ON public.contractor_tender_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Offers: vendor sees own offers only
DROP POLICY IF EXISTS contractor_tender_offers_select ON public.contractor_tender_offers;
CREATE POLICY contractor_tender_offers_select ON public.contractor_tender_offers
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.bid.submit')
  );

DROP POLICY IF EXISTS contractor_tender_offers_insert_external ON public.contractor_tender_offers;
CREATE POLICY contractor_tender_offers_insert_external ON public.contractor_tender_offers
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_actor_type = 'external'
    AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.bid.submit')
    AND EXISTS (
      SELECT 1 FROM public.contractor_tender_invitations i
      WHERE i.id = invitation_id AND i.vendor_id = contractor_tender_offers.vendor_id
        AND i.organization_id = contractor_tender_offers.organization_id)
  );

DROP POLICY IF EXISTS contractor_tender_offers_update ON public.contractor_tender_offers;
CREATE POLICY contractor_tender_offers_update ON public.contractor_tender_offers
  FOR UPDATE TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contract.manage'))
    OR (submitted_actor_type = 'external'
      AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.bid.submit'))
  )
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contract.manage'))
    OR (submitted_actor_type = 'external'
      AND app.external_has_scope(organization_id, project_id, vendor_id, NULL, 'ext.bid.submit'))
  );

DROP POLICY IF EXISTS contractor_tender_offers_service_all ON public.contractor_tender_offers;
CREATE POLICY contractor_tender_offers_service_all ON public.contractor_tender_offers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Offer financials: contract.financial.view only (internal)
DROP POLICY IF EXISTS contractor_tender_offer_financials_select ON public.contractor_tender_offer_financials;
CREATE POLICY contractor_tender_offer_financials_select ON public.contractor_tender_offer_financials
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.contractor_tender_offers o
      WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
        AND app.has_project_capability(o.organization_id, o.project_id, 'contract.financial.view')));

DROP POLICY IF EXISTS contractor_tender_offer_financials_write ON public.contractor_tender_offer_financials;
CREATE POLICY contractor_tender_offer_financials_write ON public.contractor_tender_offer_financials
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.contractor_tender_offers o
      WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
        AND app.has_project_capability(o.organization_id, o.project_id, 'contract.manage')))
  WITH CHECK (app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.contractor_tender_offers o
      WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
        AND app.has_project_capability(o.organization_id, o.project_id, 'contract.manage')));

DROP POLICY IF EXISTS contractor_tender_offer_financials_external_write ON public.contractor_tender_offer_financials;
CREATE POLICY contractor_tender_offer_financials_external_write ON public.contractor_tender_offer_financials
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contractor_tender_offers o
    WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
      AND o.submitted_actor_type = 'external'
      AND app.external_has_scope(o.organization_id, o.project_id, o.vendor_id, NULL, 'ext.bid.submit')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contractor_tender_offers o
    WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
      AND o.submitted_actor_type = 'external'
      AND app.external_has_scope(o.organization_id, o.project_id, o.vendor_id, NULL, 'ext.bid.submit')));

DROP POLICY IF EXISTS contractor_tender_offer_financials_service_all ON public.contractor_tender_offer_financials;
CREATE POLICY contractor_tender_offer_financials_service_all ON public.contractor_tender_offer_financials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Closeouts
DROP POLICY IF EXISTS subcontract_agreement_closeouts_select ON public.subcontract_agreement_closeouts;
CREATE POLICY subcontract_agreement_closeouts_select ON public.subcontract_agreement_closeouts
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.handover.submit')
  );

DROP POLICY IF EXISTS subcontract_agreement_closeouts_write ON public.subcontract_agreement_closeouts;
CREATE POLICY subcontract_agreement_closeouts_write ON public.subcontract_agreement_closeouts
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));

DROP POLICY IF EXISTS subcontract_agreement_closeouts_service_all ON public.subcontract_agreement_closeouts;
CREATE POLICY subcontract_agreement_closeouts_service_all ON public.subcontract_agreement_closeouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Checklist items
DROP POLICY IF EXISTS subcontract_closeout_items_select ON public.subcontract_closeout_checklist_items;
CREATE POLICY subcontract_closeout_items_select ON public.subcontract_closeout_checklist_items
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR EXISTS (
      SELECT 1 FROM public.subcontract_agreement_closeouts c
      WHERE c.id = closeout_id AND c.organization_id = subcontract_closeout_checklist_items.organization_id
        AND app.external_has_scope(c.organization_id, c.project_id, c.vendor_id, c.subcontract_agreement_id,
          'ext.handover.submit'))
  );

DROP POLICY IF EXISTS subcontract_closeout_items_update_external ON public.subcontract_closeout_checklist_items;
CREATE POLICY subcontract_closeout_items_update_external ON public.subcontract_closeout_checklist_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_agreement_closeouts c
    WHERE c.id = closeout_id AND c.organization_id = subcontract_closeout_checklist_items.organization_id
      AND app.external_has_scope(c.organization_id, c.project_id, c.vendor_id, c.subcontract_agreement_id,
        'ext.handover.submit')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subcontract_agreement_closeouts c
    WHERE c.id = closeout_id AND c.organization_id = subcontract_closeout_checklist_items.organization_id
      AND app.external_has_scope(c.organization_id, c.project_id, c.vendor_id, c.subcontract_agreement_id,
        'ext.handover.submit')));

DROP POLICY IF EXISTS subcontract_closeout_items_write_internal ON public.subcontract_closeout_checklist_items;
CREATE POLICY subcontract_closeout_items_write_internal ON public.subcontract_closeout_checklist_items
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));

DROP POLICY IF EXISTS subcontract_closeout_items_service_all ON public.subcontract_closeout_checklist_items;
CREATE POLICY subcontract_closeout_items_service_all ON public.subcontract_closeout_checklist_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Warranty reports
DROP POLICY IF EXISTS contractor_warranty_reports_select ON public.contractor_warranty_reports;
CREATE POLICY contractor_warranty_reports_select ON public.contractor_warranty_reports
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'project.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.handover.submit')
  );

DROP POLICY IF EXISTS contractor_warranty_reports_insert ON public.contractor_warranty_reports;
CREATE POLICY contractor_warranty_reports_insert ON public.contractor_warranty_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (app.is_org_member(organization_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
    OR (reported_actor_type = 'external'
      AND app.external_has_scope(organization_id, project_id, vendor_id, subcontract_agreement_id, 'ext.handover.submit'))
  );

DROP POLICY IF EXISTS contractor_warranty_reports_service_all ON public.contractor_warranty_reports;
CREATE POLICY contractor_warranty_reports_service_all ON public.contractor_warranty_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Performance snapshots
DROP POLICY IF EXISTS contractor_performance_snapshots_select ON public.contractor_performance_snapshots;
CREATE POLICY contractor_performance_snapshots_select ON public.contractor_performance_snapshots
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view'));

DROP POLICY IF EXISTS contractor_performance_snapshots_write ON public.contractor_performance_snapshots;
CREATE POLICY contractor_performance_snapshots_write ON public.contractor_performance_snapshots
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contractor.coordinate'));

DROP POLICY IF EXISTS contractor_performance_snapshots_service_all ON public.contractor_performance_snapshots;
CREATE POLICY contractor_performance_snapshots_service_all ON public.contractor_performance_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- Grants. RLS is not a privilege. Default privileges from 0001 are not relied on.
--------------------------------------------------------------------------------

REVOKE ALL ON TABLE public.contractor_tender_packages FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.contractor_tender_invitations FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.contractor_tender_offers FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.contractor_tender_offer_financials FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.subcontract_agreement_closeouts FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.subcontract_closeout_checklist_items FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.contractor_warranty_reports FROM PUBLIC, authenticated;
REVOKE ALL ON TABLE public.contractor_performance_snapshots FROM PUBLIC, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_tender_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_tender_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contractor_tender_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contractor_tender_offer_financials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_agreement_closeouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_closeout_checklist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contractor_warranty_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_performance_snapshots TO authenticated;

GRANT ALL ON TABLE public.contractor_tender_packages TO service_role;
GRANT ALL ON TABLE public.contractor_tender_invitations TO service_role;
GRANT ALL ON TABLE public.contractor_tender_offers TO service_role;
GRANT ALL ON TABLE public.contractor_tender_offer_financials TO service_role;
GRANT ALL ON TABLE public.subcontract_agreement_closeouts TO service_role;
GRANT ALL ON TABLE public.subcontract_closeout_checklist_items TO service_role;
GRANT ALL ON TABLE public.contractor_warranty_reports TO service_role;
GRANT ALL ON TABLE public.contractor_performance_snapshots TO service_role;

-- SECURITY DEFINER triggers replace current_user with the function owner. SET ROLE leaves
-- the role GUC at the invoker, which is the signal these guards must use.
CREATE OR REPLACE FUNCTION app.dg_invoker_is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT current_user = 'authenticated'
      OR current_setting('role', true) = 'authenticated';
$fn$;

REVOKE ALL ON FUNCTION app.dg_invoker_is_authenticated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.dg_invoker_is_authenticated() TO authenticated, service_role;

--------------------------------------------------------------------------------
-- Offer lifecycle. An external bidder cannot select, reject, retarget, or rewrite a submitted bid.
-- A new revision is a new row. Withdraw is the only post-submit transition.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.contractor_tender_offers_external_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.dg_invoker_is_authenticated() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF app.is_org_member(COALESCE(NEW.organization_id, OLD.organization_id))
     AND app.has_project_capability(
       COALESCE(NEW.organization_id, OLD.organization_id),
       COALESCE(NEW.project_id, OLD.project_id),
       'contract.manage'
     ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'submitted') THEN
      RAISE EXCEPTION 'external offer cannot be inserted as %', NEW.status USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'external offer cannot be deleted' USING ERRCODE = '42501';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.package_id IS DISTINCT FROM OLD.package_id
     OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.submitted_actor_type IS DISTINCT FROM OLD.submitted_actor_type
     OR NEW.submitted_by_principal_id IS DISTINCT FROM OLD.submitted_by_principal_id
     OR NEW.submitted_by_user_id IS DISTINCT FROM OLD.submitted_by_user_id THEN
    RAISE EXCEPTION 'external offer identity is immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('selected', 'rejected') THEN
    RAISE EXCEPTION 'external offer cannot be marked %', NEW.status USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'draft' AND NEW.status IN ('draft', 'withdrawn') AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'submitted' AND NEW.status = 'withdrawn'
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'submitted offer cannot be rewritten; withdraw or send a new revision'
    USING ERRCODE = '42501';
END;
$fn$;

REVOKE ALL ON FUNCTION app.contractor_tender_offers_external_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS contractor_tender_offers_external_guard_trg ON public.contractor_tender_offers;
CREATE TRIGGER contractor_tender_offers_external_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.contractor_tender_offers
  FOR EACH ROW EXECUTE FUNCTION app.contractor_tender_offers_external_guard();

-- Commercial terms follow the offer. Draft rows can be written. Submitted rows are frozen.
-- Selection and rejection are not columns on this table; they cannot be set here.
CREATE OR REPLACE FUNCTION app.contractor_tender_offer_financials_external_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status text;
  v_org uuid;
  v_project uuid;
  v_offer uuid;
BEGIN
  v_offer := COALESCE(NEW.offer_id, OLD.offer_id);
  SELECT o.status, o.organization_id, o.project_id
    INTO v_status, v_org, v_project
  FROM public.contractor_tender_offers o
  WHERE o.id = v_offer;

  IF NOT app.dg_invoker_is_authenticated() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_org IS NOT NULL
     AND app.is_org_member(v_org)
     AND app.has_project_capability(v_org, v_project, 'contract.manage') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'external offer financials cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'submitted offer financials are frozen' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'offer financial identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.contractor_tender_offer_financials_external_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS contractor_tender_offer_financials_external_guard_trg ON public.contractor_tender_offer_financials;
CREATE TRIGGER contractor_tender_offer_financials_external_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.contractor_tender_offer_financials
  FOR EACH ROW EXECUTE FUNCTION app.contractor_tender_offer_financials_external_guard();

-- Narrow the external financial policy to insert/update. Delete stays internal.
DROP POLICY IF EXISTS contractor_tender_offer_financials_external_write ON public.contractor_tender_offer_financials;
CREATE POLICY contractor_tender_offer_financials_external_insert ON public.contractor_tender_offer_financials
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contractor_tender_offers o
    WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
      AND o.submitted_actor_type = 'external'
      AND o.status IN ('draft', 'submitted')
      AND app.external_has_scope(o.organization_id, o.project_id, o.vendor_id, NULL, 'ext.bid.submit')));
CREATE POLICY contractor_tender_offer_financials_external_update ON public.contractor_tender_offer_financials
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contractor_tender_offers o
    WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
      AND o.submitted_actor_type = 'external'
      AND o.status = 'draft'
      AND app.external_has_scope(o.organization_id, o.project_id, o.vendor_id, NULL, 'ext.bid.submit')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contractor_tender_offers o
    WHERE o.id = offer_id AND o.organization_id = contractor_tender_offer_financials.organization_id
      AND o.submitted_actor_type = 'external'
      AND o.status = 'draft'
      AND app.external_has_scope(o.organization_id, o.project_id, o.vendor_id, NULL, 'ext.bid.submit')));

--------------------------------------------------------------------------------
-- Closeout checklist. A contractor may submit or complete an item.
-- Requirement text, required flag, kind, and waiver authority stay internal.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.subcontract_closeout_items_external_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT app.dg_invoker_is_authenticated() THEN
    RETURN NEW;
  END IF;
  IF app.is_org_member(NEW.organization_id)
     AND app.has_project_capability(NEW.organization_id, NEW.project_id, 'contractor.coordinate') THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.closeout_id IS DISTINCT FROM OLD.closeout_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.item_kind IS DISTINCT FROM OLD.item_kind
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.is_required IS DISTINCT FROM OLD.is_required
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.waive_reason IS DISTINCT FROM OLD.waive_reason
     OR NEW.waived_by_user_id IS DISTINCT FROM OLD.waived_by_user_id
     OR NEW.waived_at IS DISTINCT FROM OLD.waived_at
     OR NEW.completed_by_user_id IS DISTINCT FROM OLD.completed_by_user_id THEN
    RAISE EXCEPTION 'closeout requirement fields are internal' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'waived' AND OLD.status IS DISTINCT FROM 'waived' THEN
    RAISE EXCEPTION 'closeout waiver is internal' USING ERRCODE = '42501';
  END IF;
  IF NEW.status NOT IN ('pending', 'submitted', 'complete', 'waived') THEN
    RAISE EXCEPTION 'closeout status % is not allowed', NEW.status USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_closeout_items_external_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS subcontract_closeout_items_external_guard_trg ON public.subcontract_closeout_checklist_items;
CREATE TRIGGER subcontract_closeout_items_external_guard_trg
  BEFORE UPDATE ON public.subcontract_closeout_checklist_items
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_closeout_items_external_guard();
