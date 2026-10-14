import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });
const orgId = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';

const laborExpenses = await sql`
  SELECT e.id, e.expense_date, e.net_amount, e.description, e.cost_family, cc.key AS category_key
  FROM expenses e
  LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id
  WHERE e.organization_id = ${orgId}
    AND e.status = 'finalized' AND e.archived_at IS NULL AND e.voids_expense_id IS NULL
    AND (cc.key = 'internal_employee_payroll' OR e.cost_family = 'business_overhead')
  ORDER BY e.expense_date DESC
  LIMIT 30`;

console.log(JSON.stringify({ laborExpenses }, null, 2));
await sql.end();
