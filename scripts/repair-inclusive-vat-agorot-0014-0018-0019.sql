-- ============================================================================
-- REPAIR: inclusive VAT agorot normalization for billing 0014 / 0018 / 0019
-- Org: 8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec (Owner production)
--
-- DO NOT EXECUTE without separate, explicit Owner approval after review.
-- This file MUTATES data (UPDATE billing_records, INSERT audit_events,
-- UPDATE notifications). It does NOT change payments or applications.
--
-- Root cause: inclusive NET was stored as gross/1.18 at 6dp without rounding
-- to ILS agorot. Payments correctly stored rounded NET → phantom open dust;
-- for 0019 open.gross=0.005 displays as ₪0.01 overdue.
--
-- Repair: normalize subtotal/tax to display agorot; keep total (gross) unchanged.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 0) Preflight — must return exactly 3 rows matching expected broken values
-- --------------------------------------------------------------------------
SELECT
  br.id,
  br.reference,
  br.vat_mode,
  br.subtotal_amount,
  br.tax_amount,
  br.total_amount,
  pa.applied_amount AS paid_net,
  ROUND(br.subtotal_amount::numeric - pa.applied_amount::numeric, 6) AS open_net_before
FROM billing_records br
JOIN payment_applications pa
  ON pa.billing_record_id = br.id
 AND pa.organization_id = br.organization_id
JOIN payments p
  ON p.id = pa.payment_id
 AND p.organization_id = br.organization_id
 AND p.status::text = 'recorded'
WHERE br.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND br.reference IN ('0014', '0018', '0019')
  AND br.archived_at IS NULL
ORDER BY br.reference;

-- Guard: abort if unexpected shape (run as a check before the UPDATEs).
DO $$
DECLARE
  r record;
  ok int := 0;
BEGIN
  FOR r IN
    SELECT reference, subtotal_amount::text AS sub, tax_amount::text AS tax, total_amount::text AS tot
    FROM billing_records
    WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
      AND reference IN ('0014', '0018', '0019')
      AND archived_at IS NULL
  LOOP
    IF r.reference = '0014'
       AND r.sub = '91579.661017'
       AND r.tax = '16484.338983'
       AND r.tot = '108064.000000' THEN
      ok := ok + 1;
    ELSIF r.reference = '0018'
       AND r.sub = '35845.762712'
       AND r.tax = '6452.237288'
       AND r.tot = '42298.000000' THEN
      ok := ok + 1;
    ELSIF r.reference = '0019'
       AND r.sub = '86165.254237'
       AND r.tax = '15509.745763'
       AND r.tot = '101675.000000' THEN
      ok := ok + 1;
    ELSE
      RAISE EXCEPTION 'Preflight mismatch for %: sub=% tax=% tot=%', r.reference, r.sub, r.tax, r.tot;
    END IF;
  END LOOP;
  IF ok <> 3 THEN
    RAISE EXCEPTION 'Preflight expected 3 matching rows, got %', ok;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 1) Normalize headers + tax_snapshot (gross/total unchanged; payments untouched)
-- --------------------------------------------------------------------------

-- 0014: gross 108064 → net 91579.66 / tax 16484.34
UPDATE billing_records br
SET
  subtotal_amount = 91579.660000,
  tax_amount = 16484.340000,
  tax_snapshot = jsonb_set(
    jsonb_set(
      COALESCE(br.tax_snapshot, '{}'::jsonb),
      '{subtotalAmount}',
      to_jsonb('91579.660000'::text),
      true
    ),
    '{taxAmount}',
    to_jsonb('16484.340000'::text),
    true
  ),
  updated_at = now()
WHERE br.id = '765480bd-bfe6-477f-97c5-446e51d1624f'
  AND br.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND br.reference = '0014'
  AND br.total_amount = 108064.000000
  AND br.subtotal_amount = 91579.661017;

-- 0018: gross 42298 → net 35845.76 / tax 6452.24
UPDATE billing_records br
SET
  subtotal_amount = 35845.760000,
  tax_amount = 6452.240000,
  tax_snapshot = jsonb_set(
    jsonb_set(
      COALESCE(br.tax_snapshot, '{}'::jsonb),
      '{subtotalAmount}',
      to_jsonb('35845.760000'::text),
      true
    ),
    '{taxAmount}',
    to_jsonb('6452.240000'::text),
    true
  ),
  updated_at = now()
WHERE br.id = '25244342-030b-4fa8-9f02-bbf3a15dedd3'
  AND br.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND br.reference = '0018'
  AND br.total_amount = 42298.000000
  AND br.subtotal_amount = 35845.762712;

-- 0019: gross 101675 → net 86165.25 / tax 15509.75
UPDATE billing_records br
SET
  subtotal_amount = 86165.250000,
  tax_amount = 15509.750000,
  tax_snapshot = jsonb_set(
    jsonb_set(
      COALESCE(br.tax_snapshot, '{}'::jsonb),
      '{subtotalAmount}',
      to_jsonb('86165.250000'::text),
      true
    ),
    '{taxAmount}',
    to_jsonb('15509.750000'::text),
    true
  ),
  updated_at = now()
WHERE br.id = '7181fb32-cd52-4c96-aaf5-35c91eb35932'
  AND br.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND br.reference = '0019'
  AND br.total_amount = 101675.000000
  AND br.subtotal_amount = 86165.254237;

-- Ensure exactly 3 rows updated
DO $$
DECLARE
  n int;
BEGIN
  SELECT COUNT(*) INTO n
  FROM billing_records
  WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
    AND reference IN ('0014', '0018', '0019')
    AND (
      (reference = '0014' AND subtotal_amount = 91579.660000 AND tax_amount = 16484.340000)
      OR (reference = '0018' AND subtotal_amount = 35845.760000 AND tax_amount = 6452.240000)
      OR (reference = '0019' AND subtotal_amount = 86165.250000 AND tax_amount = 15509.750000)
    );
  IF n <> 3 THEN
    RAISE EXCEPTION 'Post-update header check failed, matched %', n;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 2) Append-only audit trail (no payment history rewritten)
-- --------------------------------------------------------------------------
INSERT INTO audit_events (
  organization_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  before,
  after,
  metadata
)
VALUES
(
  '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
  NULL,
  'billing_record.inclusive_vat_agorot_repair',
  'billing_record',
  '765480bd-bfe6-477f-97c5-446e51d1624f',
  '{"reference":"0014","subtotalAmount":"91579.661017","taxAmount":"16484.338983","totalAmount":"108064.000000"}'::jsonb,
  '{"reference":"0014","subtotalAmount":"91579.660000","taxAmount":"16484.340000","totalAmount":"108064.000000","vatMode":"inclusive","reason":"Normalize inclusive VAT NET/tax to ILS agorot; gross unchanged; payments unchanged"}'::jsonb,
  '{"repair":"inclusive_vat_agorot_0014_0018_0019","script":"scripts/repair-inclusive-vat-agorot-0014-0018-0019.sql"}'::jsonb
),
(
  '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
  NULL,
  'billing_record.inclusive_vat_agorot_repair',
  'billing_record',
  '25244342-030b-4fa8-9f02-bbf3a15dedd3',
  '{"reference":"0018","subtotalAmount":"35845.762712","taxAmount":"6452.237288","totalAmount":"42298.000000"}'::jsonb,
  '{"reference":"0018","subtotalAmount":"35845.760000","taxAmount":"6452.240000","totalAmount":"42298.000000","vatMode":"inclusive","reason":"Normalize inclusive VAT NET/tax to ILS agorot; gross unchanged; payments unchanged"}'::jsonb,
  '{"repair":"inclusive_vat_agorot_0014_0018_0019","script":"scripts/repair-inclusive-vat-agorot-0014-0018-0019.sql"}'::jsonb
),
(
  '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec',
  NULL,
  'billing_record.inclusive_vat_agorot_repair',
  'billing_record',
  '7181fb32-cd52-4c96-aaf5-35c91eb35932',
  '{"reference":"0019","subtotalAmount":"86165.254237","taxAmount":"15509.745763","totalAmount":"101675.000000"}'::jsonb,
  '{"reference":"0019","subtotalAmount":"86165.250000","taxAmount":"15509.750000","totalAmount":"101675.000000","vatMode":"inclusive","reason":"Normalize inclusive VAT NET/tax to ILS agorot; gross unchanged; payments unchanged"}'::jsonb,
  '{"repair":"inclusive_vat_agorot_0014_0018_0019","script":"scripts/repair-inclusive-vat-agorot-0014-0018-0019.sql"}'::jsonb
);

-- --------------------------------------------------------------------------
-- 3) Resolve stale overdue notifications for these billings
-- --------------------------------------------------------------------------
UPDATE notifications n
SET
  resolved_at = COALESCE(n.resolved_at, now()),
  updated_at = now()
WHERE n.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND n.entity_id IN (
    '765480bd-bfe6-477f-97c5-446e51d1624f',
    '25244342-030b-4fa8-9f02-bbf3a15dedd3',
    '7181fb32-cd52-4c96-aaf5-35c91eb35932'
  )
  AND n.type = 'billing_overdue'
  AND n.resolved_at IS NULL;

-- --------------------------------------------------------------------------
-- 4) After checks — open_net must be 0 for all three; payments unchanged
-- --------------------------------------------------------------------------
SELECT
  br.reference,
  br.subtotal_amount,
  br.tax_amount,
  br.total_amount,
  (br.subtotal_amount + br.tax_amount) AS sub_plus_tax,
  pa.applied_amount AS paid_net,
  ROUND(br.subtotal_amount::numeric - pa.applied_amount::numeric, 6) AS open_net_after,
  p.amount AS payment_amount_unchanged
FROM billing_records br
JOIN payment_applications pa
  ON pa.billing_record_id = br.id
 AND pa.organization_id = br.organization_id
JOIN payments p
  ON p.id = pa.payment_id
 AND p.organization_id = br.organization_id
 AND p.status::text = 'recorded'
WHERE br.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
  AND br.reference IN ('0014', '0018', '0019')
ORDER BY br.reference;

DO $$
DECLARE
  bad int;
BEGIN
  SELECT COUNT(*) INTO bad
  FROM billing_records br
  JOIN payment_applications pa
    ON pa.billing_record_id = br.id
   AND pa.organization_id = br.organization_id
  JOIN payments p
    ON p.id = pa.payment_id
   AND p.organization_id = br.organization_id
   AND p.status::text = 'recorded'
  WHERE br.organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'
    AND br.reference IN ('0014', '0018', '0019')
    AND ROUND(br.subtotal_amount::numeric - pa.applied_amount::numeric, 6) <> 0;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'After-check failed: % rows still have open NET', bad;
  END IF;
END $$;

-- Owner approved COMMIT on 2026-11-21.
COMMIT;
