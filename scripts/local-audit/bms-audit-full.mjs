import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const EID = 'bbd3cdce-22e5-477f-bae1-1161e87cacb6';
const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1, prepare: false });

const expense = await sql`
  SELECT id, supplier_name, description, expense_date, finalized_at, created_at, updated_at,
         installment_count, installments_paid_count, paid_gross_amount, paid_at,
         payment_status, payment_confirmation_source, gross_amount, net_amount,
         automatic_installment_payment, payment_method, notes
  FROM expenses WHERE id = ${EID}::uuid AND organization_id = ${ORG}::uuid`;

const audits = await sql`
  SELECT id, action, created_at, actor_user_id, before, after, metadata
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid AND entity_id = ${EID}::uuid
  ORDER BY created_at`;

writeFileSync(
  resolve(process.cwd(), '.tools/bms-audit-full.json'),
  JSON.stringify({ expense, audits }, null, 2),
);
console.log(JSON.stringify({ expense: expense[0], audits: audits.length }, null, 2));
await sql.end();
