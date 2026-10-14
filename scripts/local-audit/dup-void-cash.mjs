import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const voidPaid = await sql`
  SELECT id, status, net_amount::text, gross_amount::text, paid_gross_amount::text,
         paid_at, expense_date, supplier_name, project_id
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL AND status = 'void' AND paid_at IS NOT NULL`;

const hatahatim = await sql`
  SELECT id, status, project_id, net_amount::text, paid_gross_amount::text, paid_at
  FROM expenses
  WHERE id IN ('2807943d-8fcb-41e5-989d-3ee46982f8b0','52858ea4-9109-4331-8a3d-c7b67c83cfd5')`;

console.log(JSON.stringify({ voidPaid, hatahatim }, null, 2));
await sql.end();
