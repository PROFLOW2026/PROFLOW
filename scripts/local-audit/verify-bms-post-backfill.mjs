import postgres from 'postgres';
import { readFileSync } from 'fs';

const url = readFileSync('.env.local', 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1, prepare: false });
const eid = 'bbd3cdce-22e5-477f-bae1-1161e87cacb6';

const exp = await sql`
  SELECT paid_gross_amount::text, installments_paid_count, paid_at::text
  FROM expenses WHERE id = ${eid}::uuid`;
const led = await sql`
  SELECT installment_index, actual_paid_at::text, gross_paid::text
  FROM expense_installment_payments
  WHERE expense_id = ${eid}::uuid AND status = 'paid'
  ORDER BY installment_index`;
const audits = await sql`
  SELECT action, created_at
  FROM audit_events
  WHERE entity_id = ${eid}::uuid AND action LIKE '%payment%'
  ORDER BY created_at`;

console.log(JSON.stringify({ expense: exp[0], ledgerCount: led.length, ledger: led, audits }, null, 2));
await sql.end();
