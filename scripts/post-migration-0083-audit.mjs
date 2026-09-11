/**
 * Post-0083 org reconciliation audit (read-only).
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });

const ORG_ID = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const LEGACY_9 = [
  'd70fd7db-334a-47b2-9db9-1d991692d938',
  'c6f72c76-b2a8-4a8a-9b50-1f4d54120bd8',
  'fb9a0d05-5d12-4cd7-a6f0-a477db1e0a3c',
  '2b1970a2-e344-45f8-a78d-c76b12be23af',
  '8c9abbdd-2dfd-4cf4-853e-d25992f36d7e',
  '27256611-f188-4b76-9a9a-945571fa09a9',
  '8caf579d-d1a5-4d80-adb7-5096ee3851ff',
  '855503f4-6e89-4386-a91a-41d686cebc28',
  '2157d3c7-ca20-4624-bc2d-7ec4d5200336',
];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function deriveFromNet(amount, sub, tax) {
  const vatRate = sub > 0 ? tax / sub : 0;
  const paidNet = Number(amount);
  const paidVat = round2(paidNet * vatRate);
  const paidGross = round2(paidNet + paidVat);
  return { net: paidNet, vat: paidVat, gross: paidGross };
}

function deriveFromGross(amount, sub, tax) {
  const grossDoc = sub + tax || Number(amount);
  const ratio = grossDoc > 0 ? sub / grossDoc : 1;
  const paidGross = Number(amount);
  const paidNet = round2(paidGross * ratio);
  const paidVat = round2(paidGross - paidNet);
  return { net: paidNet, vat: paidVat, gross: paidGross };
}

const sql = postgres(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL, { max: 1 });

try {
  const [basisCheck] = await sql`
    SELECT
      count(*) FILTER (WHERE id = ANY(${LEGACY_9}) AND amount_basis = 'net')::int AS legacy_net,
      count(*) FILTER (WHERE status = 'recorded' AND amount_basis IS NULL)::int AS active_missing
    FROM payments
  `;

  const [billed] = await sql`
    SELECT
      SUM(CASE WHEN status IN ('void','draft') THEN 0 WHEN kind='credit_note' THEN -subtotal_amount::numeric ELSE subtotal_amount::numeric END) AS net,
      SUM(CASE WHEN status IN ('void','draft') THEN 0 WHEN kind='credit_note' THEN -COALESCE(tax_amount,0)::numeric ELSE COALESCE(tax_amount,0)::numeric END) AS vat,
      SUM(CASE WHEN status IN ('void','draft') THEN 0 WHEN kind='credit_note' THEN -(subtotal_amount::numeric + COALESCE(tax_amount,0)::numeric) ELSE (subtotal_amount::numeric + COALESCE(tax_amount,0)::numeric) END) AS gross
    FROM billing_records
    WHERE organization_id = ${ORG_ID} AND archived_at IS NULL AND currency = 'ILS'
  `;

  const paymentApps = await sql`
    SELECT
      p.id,
      p.amount,
      p.amount_basis,
      br.subtotal_amount,
      br.tax_amount
    FROM payments p
    INNER JOIN payment_applications pa ON pa.payment_id = p.id
    INNER JOIN billing_records br ON br.id = pa.billing_record_id
    WHERE p.organization_id = ${ORG_ID}
      AND p.status = 'recorded'
      AND p.currency = 'ILS'
      AND br.currency = 'ILS'
  `;

  const paid = { net: 0, vat: 0, gross: 0 };
  const seen = new Set();
  for (const row of paymentApps) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const sub = Number(row.subtotal_amount);
    const tax = Number(row.tax_amount ?? 0);
    const basis = row.amount_basis ?? 'net';
    const triplet =
      basis === 'gross' ? deriveFromGross(row.amount, sub, tax) : deriveFromNet(row.amount, sub, tax);
    paid.net += triplet.net;
    paid.vat += triplet.vat;
    paid.gross += triplet.gross;
  }
  paid.net = round2(paid.net);
  paid.vat = round2(paid.vat);
  paid.gross = round2(paid.gross);

  const billedTriplet = {
    net: round2(billed.net),
    vat: round2(billed.vat),
    gross: round2(billed.gross),
  };
  const open = {
    net: round2(billedTriplet.net - paid.net),
    vat: round2(billedTriplet.vat - paid.vat),
    gross: round2(billedTriplet.gross - paid.gross),
  };

  const [aprilBilling] = await sql`
    SELECT
      SUM(subtotal_amount::numeric) AS net,
      SUM(subtotal_amount::numeric + COALESCE(tax_amount,0)::numeric) AS gross
    FROM billing_records
    WHERE organization_id = ${ORG_ID}
      AND archived_at IS NULL
      AND currency = 'ILS'
      AND status = 'finalized'
      AND issue_date >= '2026-04-01'
      AND issue_date < '2026-05-01'
  `;

  const [aprilCollection] = await sql`
    SELECT
      SUM(
        CASE
          WHEN p.amount_basis = 'gross' THEN
            br.subtotal_amount::numeric * p.amount::numeric / NULLIF(br.subtotal_amount::numeric + COALESCE(br.tax_amount,0)::numeric, 0)
          ELSE p.amount::numeric
        END
      ) AS net,
      SUM(
        CASE
          WHEN p.amount_basis = 'gross' THEN p.amount::numeric
          ELSE p.amount::numeric * (1 + COALESCE(br.tax_amount,0)::numeric / NULLIF(br.subtotal_amount::numeric, 0))
        END
      ) AS gross
    FROM payments p
    INNER JOIN payment_applications pa ON pa.payment_id = p.id
    INNER JOIN billing_records br ON br.id = pa.billing_record_id
    WHERE p.organization_id = ${ORG_ID}
      AND p.status = 'recorded'
      AND p.currency = 'ILS'
      AND p.payment_date >= '2026-04-01'
      AND p.payment_date < '2026-05-01'
  `;

  const legacyOpen = await sql`
    SELECT br.reference,
      br.subtotal_amount::numeric AS sub,
      br.tax_amount::numeric AS tax,
      COALESCE(SUM(p.amount::numeric), 0) AS paid_raw
    FROM billing_records br
    LEFT JOIN payment_applications pa ON pa.billing_record_id = br.id
    LEFT JOIN payments p ON p.id = pa.payment_id AND p.status = 'recorded'
    WHERE br.organization_id = ${ORG_ID}
      AND br.reference IN (
        SELECT DISTINCT br2.reference FROM billing_records br2
        INNER JOIN payment_applications pa2 ON pa2.billing_record_id = br2.id
        INNER JOIN payments p2 ON p2.id = pa2.payment_id
        WHERE p2.id = ANY(${LEGACY_9})
      )
    GROUP BY br.id
  `;

  console.log(
    JSON.stringify(
      {
        migration0083: 'APPLIED',
        legacyNetClassified: basisCheck.legacy_net,
        activeMissingBasis: basisCheck.active_missing,
        orgBilled: billedTriplet,
        orgPaid: paid,
        orgOpen: open,
        reconciliation: {
          net: round2(billedTriplet.net - paid.net - open.net),
          vat: round2(billedTriplet.vat - paid.vat - open.vat),
          gross: round2(billedTriplet.gross - paid.gross - open.gross),
        },
        april2026: {
          billingNet: round2(aprilBilling.net),
          billingGross: round2(aprilBilling.gross),
          collectionNet: round2(aprilCollection.net),
          collectionGross: round2(aprilCollection.gross),
        },
        legacy9Open: legacyOpen.map((r) => {
          const sub = Number(r.sub);
          const tax = Number(r.tax);
          const gross = round2(sub + tax);
          const paidT = deriveFromNet(r.paid_raw, sub, tax);
          return {
            ref: r.reference,
            open: {
              net: round2(sub - paidT.net),
              vat: round2(tax - paidT.vat),
              gross: round2(gross - paidT.gross),
            },
          };
        }),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
