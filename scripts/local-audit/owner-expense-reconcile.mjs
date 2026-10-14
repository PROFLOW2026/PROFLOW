/**
 * READ-ONLY: expense 1a/1b vs dashboard + draft EMC in org KPI path.
 * Org: 8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const expByDate = await sql`
  SELECT to_char(e.expense_date::date, 'YYYY-MM') AS ym,
         COUNT(*)::int AS expense_cnt,
         SUM(e.net_amount::numeric) AS sum_net
  FROM expenses e
  WHERE e.organization_id = ${ORG}
    AND e.archived_at IS NULL AND e.status = 'finalized'
    AND e.voids_expense_id IS NULL
    AND COALESCE(e.is_recurring_template, false) = false
    AND e.expense_date BETWEEN DATE '2026-01-01' AND DATE '2026-10-31'
  GROUP BY 1 ORDER BY 1`;

const recognizedManagerial = await sql`
  WITH months AS (
    SELECT to_char(d, 'YYYY-MM') AS ym
    FROM generate_series(DATE '2026-01-01', DATE '2026-10-01', INTERVAL '1 month') d
  ),
  base AS (
    SELECT e.id, e.organization_id, e.currency, e.expense_date, e.net_amount, e.installment_count
    FROM expenses e
    WHERE e.organization_id = ${ORG}
      AND e.archived_at IS NULL AND e.status = 'finalized'
      AND e.voids_expense_id IS NULL
      AND COALESCE(e.is_recurring_template, false) = false
      AND COALESCE(e.inventory_stock_purchase, false) = false
  ),
  contrib AS (
    SELECT m.ym,
      CASE
        WHEN b.installment_count > 1 AND EXISTS (
          SELECT 1 FROM expense_managerial_schedule_lines l
          WHERE l.expense_id = b.id AND l.organization_id = b.organization_id
            AND l.status IN ('scheduled', 'recognized')
        ) THEN COALESCE((
          SELECT SUM(l2.amount::numeric)
          FROM expense_managerial_schedule_lines l2
          WHERE l2.expense_id = b.id AND l2.organization_id = b.organization_id
            AND l2.year_month = m.ym AND l2.status IN ('scheduled', 'recognized')
        ), 0)
        WHEN to_char(b.expense_date::date, 'YYYY-MM') = m.ym THEN b.net_amount::numeric
        ELSE 0
      END AS recognized_net
    FROM months m CROSS JOIN base b
  )
  SELECT ym, SUM(recognized_net) AS sum_recognized_net
  FROM contrib WHERE ym BETWEEN '2026-01' AND '2026-10'
  GROUP BY ym HAVING SUM(recognized_net) <> 0 ORDER BY ym`;

const draftEmcByMonth = await sql`
  SELECT year_month, COUNT(*)::int AS draft_rows, SUM(known_amount::numeric) AS draft_known
  FROM employee_month_costs
  WHERE organization_id = ${ORG} AND status = 'draft'
    AND year_month >= '2026-01' AND year_month <= '2026-10'
  GROUP BY year_month ORDER BY year_month`;

const appliedEmcByMonth = await sql`
  SELECT year_month, COUNT(*)::int AS rows, SUM(known_amount::numeric) AS known
  FROM employee_month_costs
  WHERE organization_id = ${ORG} AND status IN ('applied','closed')
    AND year_month >= '2026-01' AND year_month <= '2026-10'
  GROUP BY year_month ORDER BY year_month`;

const allocMismatch = await sql`
  SELECT COUNT(*)::int AS expenses_alloc_mismatch
  FROM expenses e
  LEFT JOIN LATERAL (
    SELECT SUM(ea.amount::numeric) AS sum_alloc
    FROM expense_allocations ea
    WHERE ea.expense_id = e.id AND ea.organization_id = e.organization_id
  ) a ON true
  WHERE e.organization_id = ${ORG}
    AND e.archived_at IS NULL AND e.status = 'finalized' AND e.voids_expense_id IS NULL
    AND e.expense_date BETWEEN DATE '2026-01-01' AND DATE '2026-10-31'
    AND ABS(e.net_amount::numeric - COALESCE(a.sum_alloc, 0)) > 0.01
    AND EXISTS (SELECT 1 FROM expense_allocations ea WHERE ea.expense_id = e.id)`;

const dashboardRef = {
  '2026-01': '94685.745762',
  '2026-02': '83228.864406',
  '2026-03': '91261.118644',
  '2026-04': '85807.203389',
  '2026-05': '96142.254237',
  '2026-06': '97567.525423',
  '2026-07': '121058.525424',
  '2026-08': '124910.254235',
  '2026-09': '122326.491524',
  '2026-10': '21733.160508',
};

const compare = recognizedManagerial.map((r) => ({
  ym: r.ym,
  sum_recognized_expenses_only: r.sum_recognized_net,
  dashboard_costsThisMonth: dashboardRef[r.ym] ?? null,
  note: 'dashboard includes labor+expenses+more; not equal to expense-only 1b',
}));

console.log(
  JSON.stringify(
    {
      expByDate,
      recognizedManagerial,
      compare,
      draftEmcByMonth,
      appliedEmcByMonth,
      allocMismatch,
      po_commitments: { po: 0, committed_costs: 0, ap_matches: 0 },
    },
    null,
    2,
  ),
);
await sql.end();
