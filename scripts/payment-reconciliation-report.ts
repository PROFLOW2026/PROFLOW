/**
 * Read-only Production reconciliation for org installment expenses (2026).
 * Run: npx tsx scripts/payment-reconciliation-report.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { resolveInstallmentPaymentState } from '../src/modules/expenses/domain/expense-installment-payment-evidence';
import {
  recognizedExpenseGrossInYearMonth,
  recognizedExpenseNetInYearMonth,
} from '../src/modules/expenses/domain/installment-payment-recognition';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const MONTHS = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
];

function loadDatabaseUrl(): string {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const match = env.match(/DATABASE_URL=(.+)/);
  if (!match) throw new Error('DATABASE_URL missing');
  return match[1]!.trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const sql = postgres(loadDatabaseUrl(), { max: 1, prepare: false });

  const expenses = await sql`
    SELECT e.id, e.supplier_name, e.expense_date::text, e.installment_count,
           e.installments_paid_count, e.paid_gross_amount::text, e.paid_at::text,
           e.net_amount::text, e.gross_amount::text, e.tax_amount::text,
           e.cash_installment_schedule, e.project_id, e.allocation_intent
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
    WHERE organization_id = ${ORG}::uuid AND entity_type = 'expense'
      AND entity_id = ANY(${ids}::uuid[])
      AND action IN ('expense.payment_confirmed', 'expense.payment_confirmation_voided')
    ORDER BY created_at`;

  const auditsBy = new Map<string, { action: string; createdAt: string; after: unknown }[]>();
  for (const a of audits) {
    const list = auditsBy.get(a.entity_id) ?? [];
    list.push({
      action: a.action,
      createdAt: new Date(a.created_at).toISOString(),
      after: a.after,
    });
    auditsBy.set(a.entity_id, list);
  }

  const transactions = [];
  const monthly = Object.fromEntries(MONTHS.map((m) => [m, { net: 0, vat: 0, gross: 0, dateUnknownGross: 0 }]));

  for (const e of expenses) {
    const auditRows = auditsBy.get(e.id) ?? [];
    const state = resolveInstallmentPaymentState({
      grossAmount: e.gross_amount,
      currency: 'ILS',
      installmentCount: e.installment_count,
      installmentStartDate: e.expense_date,
      expenseDate: e.expense_date,
      cashInstallmentSchedule: e.cash_installment_schedule,
      installmentsPaidCount: e.installments_paid_count,
      paidGrossAmount: e.paid_gross_amount,
      paidAt: e.paid_at,
      audits: auditRows,
    });

    const fields = {
      netAmount: e.net_amount,
      grossAmount: e.gross_amount,
      taxAmount: e.tax_amount,
      currency: 'ILS',
      expenseDate: e.expense_date.slice(0, 10),
      installmentCount: e.installment_count,
      installmentStartDate: e.expense_date.slice(0, 10),
      installmentsPaidCount: e.installments_paid_count,
      paidGrossAmount: e.paid_gross_amount,
      paidAt: e.paid_at?.slice(0, 10) ?? null,
      cashInstallmentSchedule: e.cash_installment_schedule,
      verifiedInstallmentPayments: state.slices.filter((s) => s.verification === 'verified'),
      dateUnknownGross: state.dateUnknownGross.amount,
      installmentPaymentStatus: state.status,
    };

    const monthBreakdown: Record<string, { net: number; gross: number }> = {};
    for (const ym of MONTHS) {
      const net = recognizedExpenseNetInYearMonth(fields, ym);
      const gross = recognizedExpenseGrossInYearMonth(fields, ym);
      const n = net ? Number(net.amount) : 0;
      const g = gross ? Number(gross.amount) : 0;
      if (n || g) monthBreakdown[ym] = { net: n, gross: g };
      monthly[ym]!.net += n;
      monthly[ym]!.gross += g;
      monthly[ym]!.vat += g - n;
    }
    monthly['2026-10']!.dateUnknownGross += Number(state.dateUnknownGross.amount);

    transactions.push({
      id: e.id,
      supplier: e.supplier_name,
      status: state.status,
      installmentCount: e.installment_count,
      installmentsPaidCount: e.installments_paid_count,
      paidGrossTotal: state.paidGrossTotal.amount,
      verifiedGrossTotal: state.verifiedGrossTotal.amount,
      dateUnknownGross: state.dateUnknownGross.amount,
      openGross: state.openGross.amount,
      auditConfirmedCount: auditRows.filter((a) => a.action === 'expense.payment_confirmed').length,
      verifiedSliceCount: state.slices.filter((s) => s.verification === 'verified').length,
      monthBreakdown,
      netTotal: Number(e.net_amount),
      grossTotal: Number(e.gross_amount),
    });
  }

  const out = {
    org: ORG,
    generatedAt: new Date().toISOString(),
    months: MONTHS,
    monthlyTotals: monthly,
    transactions,
  };

  const outPath = resolve(process.cwd(), '.tools/payment-reconciliation-2026.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote', outPath);
  console.log(JSON.stringify({ monthly, transactions: transactions.map((t) => ({ s: t.supplier, st: t.status })) }, null, 2));

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
