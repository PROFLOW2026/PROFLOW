-- 0054_product_experience
-- Additive only. Does NOT modify 0000–0053.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Product Experience 2.0 schema:
--   * OCR correction memory (confirmed vendor / project / PO / agreement hints)
--
-- Integrity (enforced in SQL, not only application code):
--   * composite tenant FKs to vendor / project / PO / agreement
--   * vendor/project columns on PO and agreement rows are optional CONTEXT
--     and must match the referenced target when present
--   * agreement mappings require project_id and it must equal agreement.project_id
--   * PO mappings: memory.project_id IS NOT DISTINCT FROM purchase_orders.project_id
--     (NULL project is allowed only when the PO itself is org-level)
--   * when a PO's project_id or vendor_id later changes, related
--     mapping_kind='purchase_order' memory is discarded (not rewritten/restamped)
--   * confirmer: active same-org membership; column-specific SET NULL on the
--     user pointer only — never SET NULL organization_id
--   * integrity/attribution guard runs on ALL INSERT/UPDATE (not a column subset)
--   * authenticated writers cannot keep or set another user's confirmer
--   * authenticated confirmation/update stamps last_confirmed_at to now()
--   * RLS: documents permission PLUS canonical domain permission PLUS
--     project access on the REAL target project (not caller-supplied project_id)
--
-- Vendor mappings are org-level (no project_id). Portal stays off.
-- Does not create a second financial engine. OCR still creates drafts only.

--------------------------------------------------------------------------------
-- Supporting unique indexes so context FKs can name the real target
--------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_id_org_vendor_uq
  ON public.purchase_orders (id, organization_id, vendor_id);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreements_id_org_project_uq
  ON public.subcontract_agreements (id, organization_id, project_id);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_agreements_id_org_vendor_uq
  ON public.subcontract_agreements (id, organization_id, vendor_id);

--------------------------------------------------------------------------------
-- OCR correction memory — confirmed mappings for future suggestions
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ocr_correction_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  mapping_kind text NOT NULL,
  source_key text NOT NULL,
  source_vendor_name text,
  source_identifier text,
  source_currency char(3),
  vendor_id uuid,
  project_id uuid,
  purchase_order_id uuid,
  subcontract_agreement_id uuid,
  confirmed_count integer NOT NULL DEFAULT 1,
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_correction_memory_kind_known CHECK (
    mapping_kind IN ('vendor', 'project', 'purchase_order', 'subcontract_agreement')
  ),
  CONSTRAINT ocr_correction_memory_source_key_nonempty CHECK (char_length(btrim(source_key)) > 0),
  CONSTRAINT ocr_correction_memory_count_positive CHECK (confirmed_count >= 1),
  -- One mapping kind / one primary target. vendor_id and project_id may appear
  -- as context on project / PO / agreement rows; they are not a second target.
  CONSTRAINT ocr_correction_memory_target_shape CHECK (
    (
      mapping_kind = 'vendor'
      AND vendor_id IS NOT NULL
      AND project_id IS NULL
      AND purchase_order_id IS NULL
      AND subcontract_agreement_id IS NULL
    )
    OR (
      mapping_kind = 'project'
      AND project_id IS NOT NULL
      AND purchase_order_id IS NULL
      AND subcontract_agreement_id IS NULL
    )
    OR (
      mapping_kind = 'purchase_order'
      AND purchase_order_id IS NOT NULL
      AND subcontract_agreement_id IS NULL
    )
    OR (
      mapping_kind = 'subcontract_agreement'
      AND subcontract_agreement_id IS NOT NULL
      AND purchase_order_id IS NULL
      AND project_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ocr_correction_memory_id_organization_id_uq
  ON public.ocr_correction_memory (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS ocr_correction_memory_org_kind_source_uq
  ON public.ocr_correction_memory (organization_id, mapping_kind, source_key);

CREATE INDEX IF NOT EXISTS ocr_correction_memory_org_vendor_idx
  ON public.ocr_correction_memory (organization_id, vendor_id)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ocr_correction_memory_org_project_idx
  ON public.ocr_correction_memory (organization_id, project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_vendor_org_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_project_org_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_po_org_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_po_org_fk
  FOREIGN KEY (purchase_order_id, organization_id)
  REFERENCES public.purchase_orders (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_po_vendor_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_po_vendor_fk
  FOREIGN KEY (purchase_order_id, organization_id, vendor_id)
  REFERENCES public.purchase_orders (id, organization_id, vendor_id)
  ON DELETE CASCADE;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_agreement_org_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_agreement_org_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id)
  REFERENCES public.subcontract_agreements (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_agreement_project_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE;

ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_agreement_vendor_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE;

-- Profile pointer: deleting the user nulls ONLY this column.
ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_confirmed_by_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_confirmed_by_fk
  FOREIGN KEY (last_confirmed_by_user_id)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

-- Same-org membership: composite SET NULL is column-specific so organization_id
-- is never nulled. MATCH SIMPLE: NULL confirmer is allowed.
ALTER TABLE public.ocr_correction_memory
  DROP CONSTRAINT IF EXISTS ocr_correction_memory_confirmed_by_membership_fk;
ALTER TABLE public.ocr_correction_memory
  ADD CONSTRAINT ocr_correction_memory_confirmed_by_membership_fk
  FOREIGN KEY (organization_id, last_confirmed_by_user_id)
  REFERENCES public.organization_memberships (organization_id, user_id)
  ON DELETE SET NULL (last_confirmed_by_user_id);

--------------------------------------------------------------------------------
-- Target-context + confirmer guards (CHECK cannot query other tables)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ocr_correction_memory_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  po_vendor uuid;
  po_project uuid;
  ag_vendor uuid;
  ag_project uuid;
  actor uuid;
BEGIN
  IF NEW.mapping_kind = 'purchase_order' THEN
    SELECT vendor_id, project_id INTO po_vendor, po_project
    FROM public.purchase_orders
    WHERE id = NEW.purchase_order_id
      AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ocr_correction_memory: purchase order not in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.project_id IS DISTINCT FROM po_project THEN
      RAISE EXCEPTION 'ocr_correction_memory: project_id must match purchase order project'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.vendor_id IS NOT NULL AND NEW.vendor_id IS DISTINCT FROM po_vendor THEN
      RAISE EXCEPTION 'ocr_correction_memory: vendor_id must match purchase order vendor'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.mapping_kind = 'subcontract_agreement' THEN
    SELECT vendor_id, project_id INTO ag_vendor, ag_project
    FROM public.subcontract_agreements
    WHERE id = NEW.subcontract_agreement_id
      AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ocr_correction_memory: subcontract agreement not in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.project_id IS DISTINCT FROM ag_project THEN
      RAISE EXCEPTION 'ocr_correction_memory: project_id must match agreement project'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.vendor_id IS NOT NULL AND NEW.vendor_id IS DISTINCT FROM ag_vendor THEN
      RAISE EXCEPTION 'ocr_correction_memory: vendor_id must match agreement vendor'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  actor := app.current_user_id();
  IF actor IS NOT NULL THEN
    IF NEW.last_confirmed_by_user_id IS DISTINCT FROM actor THEN
      RAISE EXCEPTION 'ocr_correction_memory: cannot attribute confirmation to another user'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.last_confirmed_at := now();
  END IF;

  IF NEW.last_confirmed_by_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.organization_id = NEW.organization_id
        AND m.user_id = NEW.last_confirmed_by_user_id
        AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'ocr_correction_memory: confirmer must be an active member of the organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ocr_correction_memory_integrity_guard ON public.ocr_correction_memory;
CREATE TRIGGER ocr_correction_memory_integrity_guard
  BEFORE INSERT OR UPDATE
  ON public.ocr_correction_memory
  FOR EACH ROW
  EXECUTE FUNCTION app.ocr_correction_memory_integrity_guard();

REVOKE ALL ON FUNCTION app.ocr_correction_memory_integrity_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- Discard stale PO correction-memory when the PO itself later changes project
-- or vendor context. Correction memory is a learned hint, not ledger truth:
-- do not rewrite, restamp, or attribute a new confirmer. Do not block the PO
-- update. Tenant-scoped by OLD.organization_id + OLD.id.
-- BEFORE UPDATE so the vendor triple FK cannot reject a legitimate vendor move.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ocr_correction_memory_discard_stale_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id
     AND NEW.vendor_id IS NOT DISTINCT FROM OLD.vendor_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.ocr_correction_memory
  WHERE organization_id = OLD.organization_id
    AND mapping_kind = 'purchase_order'
    AND purchase_order_id = OLD.id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ocr_correction_memory_discard_stale_po ON public.purchase_orders;
CREATE TRIGGER ocr_correction_memory_discard_stale_po
  BEFORE UPDATE OF project_id, vendor_id, organization_id
  ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION app.ocr_correction_memory_discard_stale_po();

REVOKE ALL ON FUNCTION app.ocr_correction_memory_discard_stale_po() FROM PUBLIC;

--------------------------------------------------------------------------------
-- RLS: documents permission is not a backdoor into vendor / PO / agreement
-- Project gate uses the REAL target project (PO.project_id / agreement.project_id).
-- Org-level vendor mappings and org-level POs (project_id NULL) stay org-scoped.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ocr_correction_memory_target_allowed(
  p_organization_id uuid,
  p_mapping_kind text,
  p_vendor_id uuid,
  p_project_id uuid,
  p_purchase_order_id uuid,
  p_subcontract_agreement_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_mapping_kind = 'vendor' THEN
    RETURN p_vendor_id IS NOT NULL
      AND app.has_org_permission(p_organization_id, 'vendors.read');
  END IF;

  IF p_mapping_kind = 'project' THEN
    RETURN p_project_id IS NOT NULL
      AND app.has_org_permission(p_organization_id, 'projects.read')
      AND app.can_access_project(p_organization_id, p_project_id)
      AND (
        p_vendor_id IS NULL
        OR app.has_org_permission(p_organization_id, 'vendors.read')
      );
  END IF;

  IF p_mapping_kind = 'purchase_order' THEN
    RETURN app.has_org_permission(p_organization_id, 'procurement.read')
      AND EXISTS (
        SELECT 1
        FROM public.purchase_orders po
        WHERE po.id = p_purchase_order_id
          AND po.organization_id = p_organization_id
          AND (po.project_id IS NULL OR app.can_access_project(p_organization_id, po.project_id))
      );
  END IF;

  IF p_mapping_kind = 'subcontract_agreement' THEN
    RETURN app.has_org_permission(p_organization_id, 'vendors.read')
      AND EXISTS (
        SELECT 1
        FROM public.subcontract_agreements a
        WHERE a.id = p_subcontract_agreement_id
          AND a.organization_id = p_organization_id
          AND app.can_access_project(p_organization_id, a.project_id)
      );
  END IF;

  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.ocr_correction_memory_target_allowed(uuid, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ocr_correction_memory_target_allowed(uuid, text, uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

ALTER TABLE public.ocr_correction_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_correction_memory FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ocr_correction_memory_tenant_select ON public.ocr_correction_memory;
CREATE POLICY ocr_correction_memory_tenant_select ON public.ocr_correction_memory
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.read')
    AND app.ocr_correction_memory_target_allowed(
      organization_id,
      mapping_kind,
      vendor_id,
      project_id,
      purchase_order_id,
      subcontract_agreement_id
    )
  );

DROP POLICY IF EXISTS ocr_correction_memory_tenant_insert ON public.ocr_correction_memory;
CREATE POLICY ocr_correction_memory_tenant_insert ON public.ocr_correction_memory
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.manage')
    AND app.ocr_correction_memory_target_allowed(
      organization_id,
      mapping_kind,
      vendor_id,
      project_id,
      purchase_order_id,
      subcontract_agreement_id
    )
  );

DROP POLICY IF EXISTS ocr_correction_memory_tenant_update ON public.ocr_correction_memory;
CREATE POLICY ocr_correction_memory_tenant_update ON public.ocr_correction_memory
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.manage')
    AND app.ocr_correction_memory_target_allowed(
      organization_id,
      mapping_kind,
      vendor_id,
      project_id,
      purchase_order_id,
      subcontract_agreement_id
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.manage')
    AND app.ocr_correction_memory_target_allowed(
      organization_id,
      mapping_kind,
      vendor_id,
      project_id,
      purchase_order_id,
      subcontract_agreement_id
    )
  );

DROP POLICY IF EXISTS ocr_correction_memory_tenant_delete ON public.ocr_correction_memory;
CREATE POLICY ocr_correction_memory_tenant_delete ON public.ocr_correction_memory
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'documents.manage')
    AND app.ocr_correction_memory_target_allowed(
      organization_id,
      mapping_kind,
      vendor_id,
      project_id,
      purchase_order_id,
      subcontract_agreement_id
    )
  );

DROP POLICY IF EXISTS ocr_correction_memory_service_all ON public.ocr_correction_memory;
CREATE POLICY ocr_correction_memory_service_all ON public.ocr_correction_memory
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_correction_memory TO authenticated;
GRANT ALL ON public.ocr_correction_memory TO service_role;
REVOKE ALL ON public.ocr_correction_memory FROM anon;
