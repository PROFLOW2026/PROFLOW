/**
 * READ-ONLY — March 2026 truth slices for display audit (org 8ef9…).
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const YM = '2026-03';
const FROM = '2026-03-01';
const TO = '2026-03-31';

const url = readFileSync('.env.local', 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1, prepare: false });

const emc = await sql`
  SELECT coalesce(sum(known_amount::numeric),0)::text sum_emc
  FROM employee_month_costs
  WHERE organization_id=${ORG}::uuid AND year_month=${YM} AND status IN ('draft','applied','closed')`;

const collections = await sql`
  SELECT coalesce(sum(p.amount::numeric),0)::text gross
  FROM payments p
  WHERE p.organization_id=${ORG}::uuid AND p.voided_at IS NULL
    AND p.payment_date >= ${FROM}::date AND p.payment_date <= ${TO}::date`;

const billedNet = await sql`
  SELECT coalesce(sum(b.subtotal_amount::numeric),0)::text net
  FROM billing_records b
  WHERE b.organization_id=${ORG}::uuid AND b.archived_at IS NULL
    AND b.issue_date >= ${FROM}::date AND b.issue_date <= ${TO}::date`;

const ledgerOut = await sql`
  SELECT count(*)::int n, coalesce(sum(gross_paid::numeric),0)::text gross,
         coalesce(sum(net_paid::numeric),0)::text net
  FROM expense_installment_payments
  WHERE organization_id=${ORG}::uuid AND status='paid'
    AND actual_paid_at >= ${FROM}::date AND actual_paid_at <= ${TO}::date`;

const expensePaidSingle = await sql`
  SELECT coalesce(sum(e.paid_gross_amount::numeric),0)::text gross
  FROM expenses e
  WHERE e.organization_id=${ORG}::uuid AND e.status='finalized' AND e.archived_at IS NULL
    AND e.installment_count <= 1 AND e.paid_at >= ${FROM}::date AND e.paid_at <= ${TO}::date`;

const payrollPaid = await sql`
  SELECT coalesce(sum(p.paid_amount::numeric),0)::text gross
  FROM employee_payroll_payments p
  WHERE p.organization_id=${ORG}::uuid AND p.voided_at IS NULL
    AND p.paid_at >= ${FROM}::date AND p.paid_at <= ${TO}::date`;

const apBillsNet = await sql`
  SELECT coalesce(sum(b.net_amount::numeric),0)::text net
  FROM ap_bills b
  WHERE b.organization_id=${ORG}::uuid AND b.archived_at IS NULL
    AND b.status IN ('open','partially_matched','matched')
    AND b.bill_date >= ${FROM}::date AND b.bill_date <= ${TO}::date`;

const out = {
  org: ORG,
  yearMonth: YM,
  emc: emc[0],
  collectionsGross: collections[0],
  billedNetIssueDate: billedNet[0],
  installmentLedgerPaid: ledgerOut[0],
  singleExpensePaidGross: expensePaidSingle[0],
  payrollPaidGross: payrollPaid[0],
  apBillsRecognizedNetBillDate: apBillsNet[0],
  generatedAt: new Date().toISOString(),
};

writeFileSync(resolve('.tools/audit-month-display-2026-03.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await sql.end();
