import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1, prepare: false });

const expenses = await sql`
  SELECT e.id, e.supplier_name, e.description, e.expense_date::date, e.project_id,
         e.installment_count, e.installments_paid_count,
         e.paid_gross_amount::text, e.paid_at::date, e.payment_status,
         e.net_amount::text, e.gross_amount::text, e.tax_amount::text,
         e.cash_installment_schedule, e.allocation_intent, e.cost_family
  FROM expenses e
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL AND e.status = 'finalized'
    AND COALESCE(e.installment_count, 1) > 1
    AND e.expense_date >= '2026-01-01' AND e.expense_date < '2026-11-01'
  ORDER BY e.expense_date`;

const ids = expenses.map((e) => e.id);
const audits =
  ids.length === 0
    ? []
    : await sql`
  SELECT entity_id, action, created_at, after
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid
    AND entity_type = 'expense'
    AND entity_id = ANY(${ids}::uuid[])
    AND action IN ('expense.payment_confirmed', 'expense.payment_confirmation_voided')
  ORDER BY created_at`;

const byExpense = {};
for (const a of audits) {
  (byExpense[a.entity_id] ??= []).push(a);
}

const report = expenses.map((e) => ({
  ...e,
  audits: byExpense[e.id] ?? [],
  paymentConfirmedCount: (byExpense[e.id] ?? []).filter((a) => a.action === 'expense.payment_confirmed')
    .length,
}));

writeFileSync(
  resolve(process.cwd(), '.tools/payment-audit-org-installments.json'),
  JSON.stringify({ org: ORG, generatedAt: new Date().toISOString(), report }, null, 2),
);
console.log(
  JSON.stringify(
    report.map((r) => ({
      supplier: r.supplier_name,
      id: r.id,
      paid: r.installments_paid_count,
      count: r.installment_count,
      grossPaid: r.paid_gross_amount,
      audits: r.paymentConfirmedCount,
    })),
    null,
    2,
  ),
);
await sql.end();
