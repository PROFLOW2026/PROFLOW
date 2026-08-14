-- 0043_product_columns_numbering_crm_quotes
-- Additive only. Does NOT modify 0000–0035.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Internal document sequences are NOT Israeli statutory invoice numbering.
-- CRM next-action is operational follow-up, not email.
-- Estimate discount columns feed quote_discount approval only.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS discount_amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS list_subtotal_amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(9,6);

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_text text;

CREATE INDEX IF NOT EXISTS crm_opportunities_next_action_idx
  ON public.crm_opportunities (organization_id, next_action_at)
  WHERE next_action_at IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  document_kind text NOT NULL,
  prefix text NOT NULL DEFAULT '',
  padding integer NOT NULL DEFAULT 4,
  next_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_number_sequences_kind_known CHECK (
    document_kind IN (
      'estimate',
      'change_request',
      'change_order',
      'purchase_order',
      'vendor_bill',
      'billing_record'
    )
  ),
  CONSTRAINT document_number_sequences_padding_range CHECK (padding >= 1 AND padding <= 8),
  CONSTRAINT document_number_sequences_next_positive CHECK (next_number >= 1),
  CONSTRAINT document_number_sequences_org_kind_uq UNIQUE (organization_id, document_kind)
);

COMMENT ON TABLE public.document_number_sequences IS
  'Internal tracking numbers only. Not statutory Israeli invoice issuance.';

ALTER TABLE public.document_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_number_sequences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_number_sequences_tenant_select ON public.document_number_sequences;
CREATE POLICY document_number_sequences_tenant_select ON public.document_number_sequences
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'org.read'));

DROP POLICY IF EXISTS document_number_sequences_tenant_write ON public.document_number_sequences;
CREATE POLICY document_number_sequences_tenant_write ON public.document_number_sequences
  FOR ALL TO authenticated
  USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'org.update'))
  WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, 'org.update'));

DROP POLICY IF EXISTS document_number_sequences_service_all ON public.document_number_sequences;
CREATE POLICY document_number_sequences_service_all ON public.document_number_sequences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION app.next_document_number(
  p_organization_id uuid,
  p_document_kind text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.document_number_sequences%ROWTYPE;
  v_num integer;
BEGIN
  IF p_document_kind NOT IN (
    'estimate', 'change_request', 'change_order', 'purchase_order', 'vendor_bill', 'billing_record'
  ) THEN
    RAISE EXCEPTION 'document_number_sequences: unknown kind %', p_document_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'document_number_sequences: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_document_kind = 'estimate' THEN
    IF NOT app.has_org_permission(p_organization_id, 'quotes.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires quotes.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'purchase_order' THEN
    IF NOT app.has_org_permission(p_organization_id, 'procurement.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires procurement.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'vendor_bill' THEN
    IF NOT app.has_org_permission(p_organization_id, 'ap.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires ap.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'billing_record' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'billing.manage')
      OR app.has_org_permission(p_organization_id, 'boq.billing.create')
    ) THEN
      RAISE EXCEPTION 'document_number_sequences: requires billing.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'change_request' THEN
    IF NOT app.has_org_permission(p_organization_id, 'changes.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires changes.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'change_order' THEN
    IF NOT app.has_org_permission(p_organization_id, 'changes.approve') THEN
      RAISE EXCEPTION 'document_number_sequences: requires changes.approve'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO public.document_number_sequences (organization_id, document_kind)
  VALUES (p_organization_id, p_document_kind)
  ON CONFLICT (organization_id, document_kind) DO NOTHING;

  SELECT * INTO v_row
  FROM public.document_number_sequences
  WHERE organization_id = p_organization_id AND document_kind = p_document_kind
  FOR UPDATE;

  v_num := v_row.next_number;
  UPDATE public.document_number_sequences
  SET next_number = next_number + 1, updated_at = now()
  WHERE id = v_row.id;

  RETURN CASE
    WHEN v_row.prefix IS NULL OR btrim(v_row.prefix) = '' THEN lpad(v_num::text, v_row.padding, '0')
    ELSE v_row.prefix || lpad(v_num::text, v_row.padding, '0')
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION app.next_document_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_document_number(uuid, text) TO authenticated, service_role;
