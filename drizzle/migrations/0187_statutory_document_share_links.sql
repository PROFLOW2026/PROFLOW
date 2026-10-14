-- 0187: Statutory document share links — single authoritative schema (§9.5, B04, S06).
-- Pending journal (Gate B). Additive DDL; no backfill of legacy HMAC links.

CREATE TABLE IF NOT EXISTS public.statutory_document_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  external_document_id uuid NOT NULL REFERENCES public.external_statutory_documents (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoke_reason text,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  CONSTRAINT statutory_document_share_links_token_hash_uq UNIQUE (token_hash),
  CONSTRAINT statutory_document_share_links_expiry_window CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '30 days'
  ),
  CONSTRAINT statutory_document_share_links_revoke_pair CHECK (
    (revoked_at IS NULL) = (revoked_by_user_id IS NULL)
  ),
  CONSTRAINT statutory_document_share_links_access_count_non_negative CHECK (access_count >= 0)
);

CREATE INDEX IF NOT EXISTS statutory_document_share_links_org_doc_active_idx
  ON public.statutory_document_share_links (organization_id, external_document_id)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION app.statutory_document_share_links_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app
AS $$
DECLARE
  doc_org uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT organization_id INTO doc_org
      FROM public.external_statutory_documents
     WHERE id = NEW.external_document_id;
    IF doc_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'statutory share link document must belong to organization'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.created_by_user_id IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'statutory share link creator must be current user'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.external_document_id IS DISTINCT FROM OLD.external_document_id
      OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
      OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    THEN
      RAISE EXCEPTION 'statutory share link immutable fields cannot change'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
      RAISE EXCEPTION 'statutory share link revocation cannot be undone'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.access_count < OLD.access_count THEN
      RAISE EXCEPTION 'statutory share link access_count cannot decrease'
        USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statutory_document_share_links_integrity ON public.statutory_document_share_links;
CREATE TRIGGER statutory_document_share_links_integrity
  BEFORE INSERT OR UPDATE ON public.statutory_document_share_links
  FOR EACH ROW
  EXECUTE FUNCTION app.statutory_document_share_links_integrity_guard();

ALTER TABLE public.statutory_document_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statutory_document_share_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_document_share_links_tenant_select ON public.statutory_document_share_links;
CREATE POLICY statutory_document_share_links_tenant_select ON public.statutory_document_share_links
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      app.uwm_has_permission(organization_id, 'billing.read')
      OR app.uwm_has_permission(organization_id, 'billing.manage')
    )
  );

DROP POLICY IF EXISTS statutory_document_share_links_tenant_insert ON public.statutory_document_share_links;
CREATE POLICY statutory_document_share_links_tenant_insert ON public.statutory_document_share_links
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
    AND created_by_user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS statutory_document_share_links_tenant_update ON public.statutory_document_share_links;
CREATE POLICY statutory_document_share_links_tenant_update ON public.statutory_document_share_links
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.uwm_has_permission(organization_id, 'billing.manage')
  );

DROP POLICY IF EXISTS statutory_document_share_links_service_select ON public.statutory_document_share_links;
CREATE POLICY statutory_document_share_links_service_select ON public.statutory_document_share_links
  FOR SELECT TO service_role
  USING (true);

DROP POLICY IF EXISTS statutory_document_share_links_service_access_update ON public.statutory_document_share_links;
CREATE POLICY statutory_document_share_links_service_access_update ON public.statutory_document_share_links
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE DELETE ON public.statutory_document_share_links FROM authenticated, service_role;
