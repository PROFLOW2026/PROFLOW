-- READ-ONLY diagnostic for collection reference 0019 (חורגין 36).
-- Do NOT run against Production/shared DB without explicit Owner approval.
-- Purpose: prove whether open ₪0.01 is payment shortfall, header inconsistency,
-- retention, or amount_basis / application mismatch.

-- 1) Locate the billing record
SELECT
  br.id,
  br.organization_id,
  br.reference,
  br.status,
  br.kind,
  br.subtotal_amount,
  br.tax_amount,
  br.total_amount,
  br.retention_held_remaining,
  br.due_date,
  br.currency,
  br.updated_at,
  p.name AS project_name,
  (br.subtotal_amount::numeric + COALESCE(br.tax_amount, 0)) AS sub_plus_tax,
  (br.total_amount::numeric
    - (br.subtotal_amount::numeric + COALESCE(br.tax_amount, 0))) AS total_minus_sub_tax
FROM billing_records br
LEFT JOIN projects p
  ON p.id = br.project_id
 AND p.organization_id = br.organization_id
WHERE br.archived_at IS NULL
  AND (br.reference = '0019' OR br.reference ILIKE '%0019%')
  AND (p.name ILIKE '%חורגין%' OR p.name ILIKE '%חורגין 36%')
ORDER BY br.updated_at DESC
LIMIT 10;

-- 2) Payments + applications for that reference (replace :billing_record_id)
SELECT
  p.id AS payment_id,
  p.payment_date,
  p.status,
  p.amount AS payment_amount,
  p.amount_basis,
  p.billing_record_id AS legacy_billing_record_id,
  pa.id AS application_id,
  pa.applied_amount,
  pa.billing_record_id AS applied_billing_record_id,
  pa.currency
FROM payments p
LEFT JOIN payment_applications pa
  ON pa.payment_id = p.id
 AND pa.organization_id = p.organization_id
WHERE p.organization_id = (
    SELECT organization_id FROM billing_records WHERE id = :billing_record_id
  )
  AND (
    p.billing_record_id = :billing_record_id
    OR pa.billing_record_id = :billing_record_id
  )
ORDER BY p.payment_date, p.id, pa.id;

-- 3) Naive open NET (mirrors TS when amount_basis = net)
SELECT
  br.subtotal_amount::numeric AS billed_net,
  br.tax_amount::numeric AS billed_vat,
  br.total_amount::numeric AS billed_total_column,
  br.retention_held_remaining::numeric AS retention_net,
  COALESCE((
    SELECT SUM(pa.applied_amount::numeric)
    FROM payment_applications pa
    INNER JOIN payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
    WHERE pa.billing_record_id = br.id
      AND pa.organization_id = br.organization_id
      AND p.status::text = 'recorded'
  ), 0) AS sum_applied_net,
  br.subtotal_amount::numeric
    - COALESCE((
        SELECT SUM(pa.applied_amount::numeric)
        FROM payment_applications pa
        INNER JOIN payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
        WHERE pa.billing_record_id = br.id
          AND pa.organization_id = br.organization_id
          AND p.status::text = 'recorded'
      ), 0)
    - br.retention_held_remaining::numeric AS open_net_naive
FROM billing_records br
WHERE br.id = :billing_record_id;

-- 4) Other org collections with |open| between 0.005 and 0.02 (suspicious agora)
-- Replace :organization_id after step 1.
WITH billed AS (
  SELECT
    br.id,
    br.reference,
    br.subtotal_amount::numeric AS billed_net,
    br.retention_held_remaining::numeric AS retention_net,
    p.name AS project_name
  FROM billing_records br
  LEFT JOIN projects p ON p.id = br.project_id AND p.organization_id = br.organization_id
  WHERE br.organization_id = :organization_id
    AND br.archived_at IS NULL
    AND br.status::text NOT IN ('draft', 'void')
),
paid AS (
  SELECT pa.billing_record_id, SUM(pa.applied_amount::numeric) AS paid_net
  FROM payment_applications pa
  INNER JOIN payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
  WHERE pa.organization_id = :organization_id
    AND p.status::text = 'recorded'
  GROUP BY pa.billing_record_id
)
SELECT
  b.id,
  b.reference,
  b.project_name,
  b.billed_net,
  COALESCE(p.paid_net, 0) AS paid_net,
  ROUND(b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net, 6) AS open_net
FROM billed b
LEFT JOIN paid p ON p.billing_record_id = b.id
WHERE ABS(b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net) >= 0.005
  AND ABS(b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net) <= 0.02
ORDER BY open_net DESC;
