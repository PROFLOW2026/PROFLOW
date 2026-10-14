import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const cellular = await sql`
  SELECT e.id, e.expense_date, e.status, e.description, e.supplier_name,
         e.net_amount::text, e.tax_amount::text, e.gross_amount::text,
         e.paid_gross_amount::text, e.paid_at, e.payment_status,
         e.installment_count, e.installment_start_date, e.installments_paid_count,
         e.cash_installment_schedule, e.due_date, e.notes
  FROM expenses e
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL
    AND e.expense_date >= '2026-03-01' AND e.expense_date < '2026-04-01'
    AND (e.supplier_name ILIKE '%סלולר%' OR e.description ILIKE '%סלולר%')
  ORDER BY e.expense_date, e.id`;

const installments = await sql`
  SELECT e.id, e.expense_date::date, e.status, e.supplier_name, e.description,
         e.net_amount::text, e.gross_amount::text, e.paid_gross_amount::text,
         e.paid_at::date, e.installment_count, e.installments_paid_count,
         e.installment_start_date::date, e.cash_installment_schedule,
         e.payment_status, e.voids_expense_id
  FROM expenses e
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL
    AND e.expense_date >= '2026-01-01' AND e.expense_date < '2026-11-01'
    AND (COALESCE(e.installment_count, 1) > 1 OR e.cash_installment_schedule IS NOT NULL)
  ORDER BY e.expense_date, e.id`;

const reversals = await sql`
  SELECT e.id, e.expense_date::date, e.status, e.supplier_name, e.description,
         e.net_amount::text, e.gross_amount::text, e.voids_expense_id,
         e.adjusts_expense_id, e.notes
  FROM expenses e
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL
    AND e.expense_date >= '2026-01-01' AND e.expense_date < '2026-11-01'
    AND (e.voids_expense_id IS NOT NULL OR e.net_amount::numeric < 0)
  ORDER BY e.expense_date, e.id`;

const reversalTargets = await sql`
  SELECT e.id, e.expense_date::date, e.status, e.supplier_name, e.net_amount::text,
         e.gross_amount::text
  FROM expenses e
  WHERE e.organization_id = ${ORG}::uuid
    AND e.id IN (
      SELECT voids_expense_id FROM expenses
      WHERE organization_id = ${ORG}::uuid AND voids_expense_id IS NOT NULL
        AND expense_date >= '2026-01-01' AND expense_date < '2026-11-01'
    )`;

const mgrLines = await sql`
  SELECT m.expense_id, m.year_month, m.amount::text, m.status
  FROM expense_managerial_schedule_lines m
  JOIN expenses e ON e.id = m.expense_id AND e.organization_id = m.organization_id
  WHERE m.organization_id = ${ORG}::uuid
    AND m.year_month >= '2026-01' AND m.year_month <= '2026-10'
    AND e.archived_at IS NULL
    AND COALESCE(e.installment_count, 1) > 1
  ORDER BY m.expense_id, m.year_month`;

const recognizedByMonth = await sql`
  SELECT to_char(expense_date, 'YYYY-MM') AS ym,
         sum(net_amount::numeric)::text AS net,
         count(*)::int AS cnt
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL
    AND expense_date >= '2026-01-01' AND expense_date < '2026-11-01'
    AND status = 'finalized'
  GROUP BY 1 ORDER BY 1`;

const partialPaid = await sql`
  SELECT id, expense_date::date, supplier_name, description, status,
         gross_amount::text, paid_gross_amount::text, payment_status, paid_at::date,
         installment_count, installments_paid_count
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL
    AND expense_date >= '2026-01-01' AND expense_date < '2026-11-01'
    AND status = 'finalized'
    AND paid_gross_amount IS NOT NULL
    AND paid_gross_amount::numeric > 0
    AND paid_gross_amount::numeric < gross_amount::numeric
  ORDER BY expense_date`;

const out = {
  cellular,
  installments,
  reversals,
  reversalTargets,
  mgrLines,
  recognizedByMonth,
  partialPaid,
};
writeFileSync(resolve(process.cwd(), '.tools/excel-installment-audit.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  cellular: cellular.length,
  installments: installments.length,
  reversals: reversals.length,
  partialPaid: partialPaid.length,
}, null, 2));
await sql.end();
