/**
 * EB-1 extension: 0181 backfill state (SELECT only).
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) process.exit(1);

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const BMS = 'bbd3cdce-22e5-477f-bae1-1161e87cacb6';
const LUMP_AUDIT = '4bb219d3-847a-48de-98ce-53811f418ac2';

const sql = postgres(url, { max: 1, prepare: false });

const BMS_KEYS = Array.from({ length: 9 }, (_, i) => {
  const m = String(i + 1).padStart(2, '0');
  return `bms-owner-2026-${m}`;
});

try {
  const [orgOk, bmsOk] = await Promise.all([
    sql`SELECT 1 AS ok FROM organizations WHERE id = ${ORG}::uuid LIMIT 1`,
    sql`SELECT id, paid_gross_amount::text, paid_at::text, installments_paid_count, payment_status, gross_amount::text, net_amount::text, installment_count FROM expenses WHERE id = ${BMS}::uuid AND organization_id = ${ORG}::uuid`,
  ]);

  const bmsRows = await sql`
    SELECT installment_index, idempotency_key, gross_paid::text, actual_paid_at::text, status
    FROM expense_installment_payments
    WHERE organization_id = ${ORG}::uuid AND expense_id = ${BMS}::uuid
    ORDER BY installment_index NULLS LAST, idempotency_key
  `;

  const keyHits = await sql`
    SELECT idempotency_key, count(*)::int AS n
    FROM expense_installment_payments
    WHERE organization_id = ${ORG}::uuid
      AND idempotency_key = ANY(${BMS_KEYS})
    GROUP BY idempotency_key
    ORDER BY idempotency_key
  `;

  const voidAudit = await sql`
    SELECT count(*)::int AS n
    FROM audit_events
    WHERE organization_id = ${ORG}::uuid
      AND entity_id = ${BMS}::uuid
      AND action = 'expense.payment_confirmation_voided'
      AND metadata->>'voidedAuditId' = ${LUMP_AUDIT}
  `;

  const auditBackfill = await sql`
    SELECT count(*)::int AS n
    FROM expense_installment_payments
    WHERE organization_id = ${ORG}::uuid
      AND idempotency_key LIKE 'audit-%'
  `;

  const eligibleUnbackfilled = await sql`
    SELECT count(*)::int AS n
    FROM audit_events ae
    JOIN expenses e ON e.id = ae.entity_id AND e.organization_id = ae.organization_id
    WHERE ae.organization_id = ${ORG}::uuid
      AND ae.entity_type = 'expense'
      AND ae.action = 'expense.payment_confirmed'
      AND e.id <> ${BMS}::uuid
      AND e.installment_count > 1
      AND (ae.after ? 'installmentIndex' OR ae.after ? 'installment_index')
      AND NOT EXISTS (
        SELECT 1 FROM expense_installment_payments p WHERE p.audit_event_id = ae.id
      )
  `;

  console.log(
    JSON.stringify(
      {
        orgPresent: orgOk.length > 0,
        bmsExpense: bmsOk[0] ?? null,
        bmsInstallmentRowCount: bmsRows.length,
        bmsInstallmentRows: bmsRows,
        expectedBmsKeys: BMS_KEYS,
        bmsKeyHits: keyHits,
        missingBmsKeys: BMS_KEYS.filter((k) => !keyHits.some((h) => h.idempotency_key === k)),
        duplicateBmsKeys: keyHits.filter((h) => h.n > 1),
        voidAuditForLump: voidAudit[0]?.n ?? 0,
        orgAuditBackfillRows: auditBackfill[0]?.n ?? 0,
        eligibleAuditEventsStillMissingLedger: eligibleUnbackfilled[0]?.n ?? 0,
        orgTotalInstallmentRows: (
          await sql`SELECT count(*)::int AS n FROM expense_installment_payments WHERE organization_id = ${ORG}::uuid`
        )[0]?.n,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
