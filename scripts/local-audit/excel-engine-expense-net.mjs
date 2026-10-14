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
  WITH base AS (
    SELECT e.id, e.expense_date, e.net_amount, e.installment_count, e.status
    FROM expenses e
    WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL
      AND e.status = 'finalized'
      AND coalesce(e.inventory_stock_purchase, false) = false
  ),
  months AS (
    SELECT unnest(ARRAY['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']) AS ym
  )
  SELECT m.ym,
         coalesce(sum(
           CASE
             WHEN b.installment_count > 1 AND EXISTS (
               SELECT 1 FROM expense_managerial_schedule_lines l
               WHERE l.expense_id = b.id AND l.organization_id = ${ORG}::uuid
                 AND l.status IN ('scheduled','recognized')
             ) THEN coalesce((
               SELECT sum(l2.amount) FROM expense_managerial_schedule_lines l2
               WHERE l2.expense_id = b.id AND l2.organization_id = ${ORG}::uuid
                 AND l2.year_month = m.ym AND l2.status IN ('scheduled','recognized')
             ), 0)
             WHEN to_char(b.expense_date::date, 'YYYY-MM') = m.ym THEN b.net_amount
             ELSE 0
           END
         ), 0)::text AS engine_net
  FROM months m
  CROSS JOIN base b
  GROUP BY m.ym
  ORDER BY m.ym`;

console.log(JSON.stringify(rows, null, 2));
await sql.end();
