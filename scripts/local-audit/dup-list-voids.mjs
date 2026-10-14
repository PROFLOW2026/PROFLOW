import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const rows = await sql`
  SELECT id, expense_date::date AS expense_date, status, net_amount::text, gross_amount::text,
         supplier_name, project_id, paid_at::date AS paid_at, voids_expense_id,
         (source_recurring_draft_id IS NOT NULL) AS from_recurring, left(notes, 80) AS notes
  FROM expenses
  WHERE organization_id = ${ORG}::uuid
    AND archived_at IS NULL
    AND expense_date >= '2026-01-01'
    AND expense_date < '2026-11-01'
    AND status = 'void'
  ORDER BY expense_date, id`;

console.log(JSON.stringify(rows, null, 2));
await sql.end();
