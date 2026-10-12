-- 0181: Owner-approved BMS (bbd3cdce…) Jan–Sep 2026 installment ledger + indexed audit backfill.
-- Voids erroneous manual lump 8689 on 2026-09-06 to prevent double recognition.

DO $$
DECLARE
  v_org uuid := '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
  v_bms uuid := 'bbd3cdce-22e5-477f-bae1-1161e87cacb6';
  v_lump_audit uuid := '4bb219d3-847a-48de-98ce-53811f418ac2';
  v_actor uuid := '1abea18f-3d08-44ab-a42a-4509900e6117';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE NOTICE '0181 skipped: owner org not present';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM expenses WHERE id = v_bms AND organization_id = v_org) THEN
    RAISE NOTICE '0181 skipped: BMS expense not present';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM audit_events
     WHERE organization_id = v_org
       AND entity_id = v_bms
       AND action = 'expense.payment_confirmation_voided'
       AND metadata->>'voidedAuditId' = v_lump_audit::text
  ) THEN
    INSERT INTO audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id, before, after, metadata
    ) VALUES (
      v_org,
      v_actor,
      'expense.payment_confirmation_voided',
      'expense',
      v_bms,
      jsonb_build_object(
        'paidAt', '2026-09-06',
        'source', 'manual',
        'paidGrossAmount', '8689.000000'
      ),
      NULL,
      jsonb_build_object(
        'reason', 'owner_bms_12_installment_policy',
        'voidedAuditId', v_lump_audit::text
      )
    );
  END IF;

  INSERT INTO expense_installment_payments (
    organization_id, expense_id, installment_index, payment_sequence, due_date,
    actual_paid_at, gross_paid, net_paid, vat_paid, status, payment_reference, idempotency_key
  ) VALUES
    (v_org, v_bms, 0, 1, '2026-01-01', '2026-01-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-01'),
    (v_org, v_bms, 1, 1, '2026-02-01', '2026-02-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-02'),
    (v_org, v_bms, 2, 1, '2026-03-01', '2026-03-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-03'),
    (v_org, v_bms, 3, 1, '2026-04-01', '2026-04-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-04'),
    (v_org, v_bms, 4, 1, '2026-05-01', '2026-05-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-05'),
    (v_org, v_bms, 5, 1, '2026-06-01', '2026-06-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-06'),
    (v_org, v_bms, 6, 1, '2026-07-01', '2026-07-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-07'),
    (v_org, v_bms, 7, 1, '2026-08-01', '2026-08-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-08'),
    (v_org, v_bms, 8, 1, '2026-09-01', '2026-09-01', 724.080000, 613.627119, 110.452881, 'paid', 'owner_approved', 'bms-owner-2026-09')
  ON CONFLICT DO NOTHING;

  UPDATE expenses
     SET paid_gross_amount = 6516.720000,
         paid_at = '2026-09-01',
         installments_paid_count = 9,
         payment_status = 'upcoming',
         updated_at = now()
   WHERE id = v_bms
     AND organization_id = v_org;

  INSERT INTO expense_installment_payments (
    organization_id,
    expense_id,
    installment_index,
    payment_sequence,
    actual_paid_at,
    gross_paid,
    net_paid,
    vat_paid,
    status,
    audit_event_id,
    idempotency_key,
    payment_reference
  )
  SELECT
    e.organization_id,
    e.id,
    COALESCE(
      NULLIF(ae.after->>'installmentIndex', '')::int,
      NULLIF(ae.after->>'installment_index', '')::int
    ),
    1,
    COALESCE(
      NULLIF(ae.after->>'paidAt', '')::date,
      NULLIF(ae.after->>'paid_at', '')::date
    ),
    COALESCE(
      NULLIF(ae.after->>'paidGrossAmount', '')::numeric,
      NULLIF(ae.after->>'paid_gross_amount', '')::numeric
    ),
    round(
      COALESCE(
        NULLIF(ae.after->>'paidGrossAmount', '')::numeric,
        NULLIF(ae.after->>'paid_gross_amount', '')::numeric
      ) * e.net_amount / NULLIF(e.gross_amount, 0),
      6
    ),
    COALESCE(
      NULLIF(ae.after->>'paidGrossAmount', '')::numeric,
      NULLIF(ae.after->>'paid_gross_amount', '')::numeric
    ) - round(
      COALESCE(
        NULLIF(ae.after->>'paidGrossAmount', '')::numeric,
        NULLIF(ae.after->>'paid_gross_amount', '')::numeric
      ) * e.net_amount / NULLIF(e.gross_amount, 0),
      6
    ),
    'paid',
    ae.id,
    'audit-' || ae.id::text,
    COALESCE(ae.after->>'source', 'audit_backfill')
  FROM audit_events ae
  JOIN expenses e
    ON e.id = ae.entity_id
   AND e.organization_id = ae.organization_id
  WHERE ae.organization_id = v_org
    AND ae.entity_type = 'expense'
    AND ae.action = 'expense.payment_confirmed'
    AND e.id <> v_bms
    AND e.installment_count > 1
    AND (
      ae.after ? 'installmentIndex'
      OR ae.after ? 'installment_index'
    )
    AND COALESCE(
      NULLIF(ae.after->>'installmentIndex', '')::int,
      NULLIF(ae.after->>'installment_index', '')::int
    ) IS NOT NULL
    AND COALESCE(
      NULLIF(ae.after->>'paidAt', '')::date,
      NULLIF(ae.after->>'paid_at', '')::date
    ) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
        FROM expense_installment_payments p
       WHERE p.audit_event_id = ae.id
    )
  ON CONFLICT DO NOTHING;
END $$;
