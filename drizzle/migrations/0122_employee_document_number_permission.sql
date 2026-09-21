-- 0122: Employee App document-number permission.
-- Migration after 0121. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0121.
-- PREPARED ONLY. Do not apply until the Owner approves execution.
--
-- app.next_document_number() authorized each kind with app.has_org_permission,
-- which reads organization role_assignments only. Employee App grants live in
-- employee_permission_grants and are visible to app.uwm_has_permission
-- (org RBAC OR employee grant). Employee projects.create therefore raised
-- 42501 inside next_document_number even after the application check passed.
--
-- This replaces the permission checks only. Membership is still required.
-- No table data is updated. No provider files are moved.

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
  v_prefix text;
  v_padding integer;
BEGIN
  IF p_document_kind NOT IN (
    'estimate', 'change_request', 'change_order', 'purchase_order', 'vendor_bill', 'billing_record',
    'project', 'job', 'work_order'
  ) THEN
    RAISE EXCEPTION 'document_number_sequences: unknown kind %', p_document_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'document_number_sequences: not org member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_document_kind = 'estimate' THEN
    IF NOT app.uwm_has_permission(p_organization_id, 'quotes.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires quotes.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'purchase_order' THEN
    IF NOT app.uwm_has_permission(p_organization_id, 'procurement.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires procurement.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'vendor_bill' THEN
    IF NOT app.uwm_has_permission(p_organization_id, 'ap.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires ap.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'billing_record' THEN
    IF NOT (
      app.uwm_has_permission(p_organization_id, 'billing.manage')
      OR app.uwm_has_permission(p_organization_id, 'boq.billing.create')
    ) THEN
      RAISE EXCEPTION 'document_number_sequences: requires billing.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'change_request' THEN
    IF NOT app.uwm_has_permission(p_organization_id, 'changes.manage') THEN
      RAISE EXCEPTION 'document_number_sequences: requires changes.manage'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind = 'change_order' THEN
    IF NOT app.uwm_has_permission(p_organization_id, 'changes.approve') THEN
      RAISE EXCEPTION 'document_number_sequences: requires changes.approve'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_document_kind IN ('project', 'job', 'work_order') THEN
    IF NOT app.uwm_has_permission(p_organization_id, 'projects.create') THEN
      RAISE EXCEPTION 'document_number_sequences: requires projects.create'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_prefix := CASE p_document_kind
    WHEN 'project' THEN 'PRJ-'
    WHEN 'job' THEN 'JOB-'
    WHEN 'work_order' THEN 'WO-'
    ELSE ''
  END;
  v_padding := CASE
    WHEN p_document_kind IN ('project', 'job', 'work_order') THEN 5
    ELSE 4
  END;

  INSERT INTO public.document_number_sequences (
    organization_id, document_kind, prefix, padding, next_number
  )
  VALUES (p_organization_id, p_document_kind, v_prefix, v_padding, 1)
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
