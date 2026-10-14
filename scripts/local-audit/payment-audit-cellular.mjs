import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const EID = 'e800507f-2ff4-468b-aa32-63a849ba398d';
const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const expense = await sql`
  SELECT * FROM expenses WHERE id = ${EID}::uuid AND organization_id = ${ORG}::uuid`;

const audits = await sql`
  SELECT action, created_at, before, after
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid AND entity_id = ${EID}::uuid
  ORDER BY created_at`;

const allInstall = await sql`
  SELECT id, supplier_name, expense_date::date, installment_count, installments_paid_count,
         paid_gross_amount::text, paid_at::date, payment_status, net_amount::text,
         gross_amount::text, tax_amount::text, cash_installment_schedule, status
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL AND status = 'finalized'
    AND COALESCE(installment_count, 1) > 1
    AND expense_date >= '2026-01-01' AND expense_date < '2026-11-01'
  ORDER BY expense_date`;

writeFileSync(
  resolve(process.cwd(), '.tools/payment-audit-cellular.json'),
  JSON.stringify({ expense, audits, allInstall }, null, 2),
);
console.log(JSON.stringify({ audits: audits.length, install: allInstall.length }, null, 2));
await sql.end();
