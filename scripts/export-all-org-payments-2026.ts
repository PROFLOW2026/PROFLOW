/**
 * READ-ONLY: all verified cash payments Jan–Oct 2026 for owner org (expenses + payroll + receipts).
 * Output: .tools/org-all-payments-2026.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { resolveInstallmentPaymentState } from '../src/modules/expenses/domain/expense-installment-payment-evidence';

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

const VOID_TECHNICAL_IDS = new Set([
  'b068332b-ac7b-469d-935e-dd237eb94956',
  '6906893f-9748-4e86-81e5-5da5c83a3a69',
  '7f31c326-2f00-4130-a866-9b15bf417196',
  'f59305ca-886e-4a92-a6b3-d1c1ecd3a82d',
  '9637b0ad-e611-4943-bb47-de6f41d241f1',
  '227eaec3-48ec-4cf0-a4b2-46ec0d4d3032',
]);

function loadDatabaseUrl(): string {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const match = env.match(/DATABASE_URL=(.+)/);
  if (!match) throw new Error('DATABASE_URL missing');
  return match[1]!.trim().replace(/^["']|["']$/g, '');
}

function ym(d: string): string {
  return d.slice(0, 7);
}

function netFromGross(gross: number, netT: number, grossT: number): number {
  return grossT > 0 ? (gross * netT) / grossT : 0;
}

export type PaymentRow = {
  paymentDate: string | null;
  yearMonth: string | null;
  kind: 'expense' | 'payroll' | 'customer_receipt' | 'expense_date_unknown';
  counterparty: string;
  description: string;
  net: number;
  vat: number;
  gross: number;
  allocation: string;
  sourceId: string;
  note: string;
};

async function main() {
  const sql = postgres(loadDatabaseUrl(), { max: 1, prepare: false });
  const byMonth: Record<string, PaymentRow[]> = Object.fromEntries(MONTHS.map((m) => [m, []]));
  const dateUnknown: PaymentRow[] = [];
  const commitments: PaymentRow[] = [];

  const expenses = await sql`
    SELECT e.id, e.supplier_name, e.description, e.status, e.expense_date::text,
           e.installment_count, e.installments_paid_count,
           e.paid_gross_amount::text, e.paid_at::text,
           e.net_amount::text, e.gross_amount::text, e.tax_amount::text,
           e.cash_installment_schedule, e.project_id, e.allocation_intent,
           e.payment_status, p.name AS project_name
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE e.organization_id = ${ORG}::uuid
      AND e.archived_at IS NULL
      AND e.status = 'finalized'
      AND e.expense_date >= '2026-01-01' AND e.expense_date < '2026-11-01'
    ORDER BY e.expense_date`;

  const ids = expenses.map((e) => e.id).filter((id) => !VOID_TECHNICAL_IDS.has(id));
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

  for (const e of expenses) {
    if (VOID_TECHNICAL_IDS.has(e.id)) continue;
    const netT = Number(e.net_amount);
    const grossT = Number(e.gross_amount);
    const vatT = Number(e.tax_amount ?? grossT - netT);
    const supplier = e.supplier_name || e.description || '—';
    const desc = e.description || 'הוצאה';
    const alloc = e.project_name
      ? `פרויקט: ${e.project_name}`
      : e.allocation_intent === 'auto_pool'
        ? 'תקורה / מאגר'
        : e.allocation_intent || '—';

    const inst = Number(e.installment_count ?? 1);
    if (inst > 1) {
      const state = resolveInstallmentPaymentState({
        grossAmount: e.gross_amount,
        currency: 'ILS',
        installmentCount: inst,
        installmentStartDate: e.expense_date,
        expenseDate: e.expense_date,
        cashInstallmentSchedule: e.cash_installment_schedule,
        installmentsPaidCount: e.installments_paid_count,
        paidGrossAmount: e.paid_gross_amount,
        paidAt: e.paid_at,
        audits: auditsBy.get(e.id) ?? [],
      });
      for (const slice of state.slices) {
        if (slice.verification !== 'verified' || !slice.actualPaidAt) continue;
        const g = Number(slice.grossPaid.amount);
        const n = netFromGross(g, netT, grossT);
        const row: PaymentRow = {
          paymentDate: slice.actualPaidAt,
          yearMonth: ym(slice.actualPaidAt),
          kind: 'expense',
          counterparty: supplier,
          description: `${desc} (פריסה)`,
          net: n,
          vat: g - n,
          gross: g,
          allocation: alloc,
          sourceId: e.id,
          note: `פעימה ${slice.installmentIndex >= 0 ? slice.installmentIndex + 1 : 'מרוכז'}`,
        };
        if (row.yearMonth && MONTHS.includes(row.yearMonth)) byMonth[row.yearMonth]!.push(row);
      }
      const unk = Number(state.dateUnknownGross.amount);
      if (unk > 0.01) {
        dateUnknown.push({
          paymentDate: e.paid_at?.slice(0, 10) ?? null,
          yearMonth: null,
          kind: 'expense_date_unknown',
          counterparty: supplier,
          description: desc,
          net: netFromGross(unk, netT, grossT),
          vat: unk - netFromGross(unk, netT, grossT),
          gross: unk,
          allocation: alloc,
          sourceId: e.id,
          note: state.status,
        });
      }
      const open = Number(state.openGross.amount);
      if (open > 0.01) {
        commitments.push({
          paymentDate: null,
          yearMonth: null,
          kind: 'expense',
          counterparty: supplier,
          description: `${desc} — יתרה לתשלום`,
          net: netFromGross(open, netT, grossT),
          vat: open - netFromGross(open, netT, grossT),
          gross: open,
          allocation: alloc,
          sourceId: e.id,
          note: 'commitment',
        });
      }
      continue;
    }

    const paidGross = Number(e.paid_gross_amount ?? 0);
    if (paidGross <= 0) {
      if (Number(e.gross_amount) > 0 && e.payment_status !== 'paid') {
        commitments.push({
          paymentDate: null,
          yearMonth: null,
          kind: 'expense',
          counterparty: supplier,
          description: `${desc} — לא שולם`,
          net: netT,
          vat: vatT,
          gross: grossT,
          allocation: alloc,
          sourceId: e.id,
          note: 'commitment',
        });
      }
      continue;
    }
    const paidAt = e.paid_at?.slice(0, 10) ?? null;
    const g = paidGross;
    const n = netFromGross(g, netT, grossT);
    if (!paidAt) {
      dateUnknown.push({
        paymentDate: null,
        yearMonth: null,
        kind: 'expense_date_unknown',
        counterparty: supplier,
        description: desc,
        net: n,
        vat: g - n,
        gross: g,
        allocation: alloc,
        sourceId: e.id,
        note: 'PAID_DATE_UNKNOWN',
      });
      continue;
    }
    const m = ym(paidAt);
    const row: PaymentRow = {
      paymentDate: paidAt,
      yearMonth: m,
      kind: 'expense',
      counterparty: supplier,
      description: desc,
      net: n,
      vat: g - n,
      gross: g,
      allocation: alloc,
      sourceId: e.id,
      note: 'single',
    };
    if (MONTHS.includes(m)) byMonth[m]!.push(row);
  }

  const payroll = await sql`
    SELECT p.id, e.name, p.year_month, p.paid_at::text, p.paid_amount::text, p.expected_amount::text
    FROM employee_payroll_payments p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.organization_id = ${ORG}::uuid AND p.voided_at IS NULL
      AND p.paid_at IS NOT NULL
      AND p.paid_at >= '2026-01-01' AND p.paid_at < '2026-11-01'
    ORDER BY p.paid_at`;

  for (const p of payroll) {
    const paidAt = p.paid_at!.slice(0, 10);
    const m = ym(paidAt);
    const gross = Number(p.paid_amount ?? 0);
    if (gross <= 0) continue;
    const row: PaymentRow = {
      paymentDate: paidAt,
      yearMonth: m,
      kind: 'payroll',
      counterparty: p.name,
      description: `תשלום שכר ${p.year_month}`,
      net: gross,
      vat: 0,
      gross,
      allocation: 'שכר — לא EMC',
      sourceId: p.id,
      note: 'payroll_cash',
    };
    if (MONTHS.includes(m)) byMonth[m]!.push(row);
  }

  const receipts = await sql`
    SELECT p.id, p.payment_date::text, p.amount::text, c.name AS client_name
    FROM payments p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.organization_id = ${ORG}::uuid
      AND p.voided_at IS NULL
      AND p.payment_date >= '2026-01-01' AND p.payment_date < '2026-11-01'
    ORDER BY p.payment_date`;

  for (const r of receipts) {
    const paidAt = r.payment_date!.slice(0, 10);
    const m = ym(paidAt);
    const gross = Number(r.amount);
    const row: PaymentRow = {
      paymentDate: paidAt,
      yearMonth: m,
      kind: 'customer_receipt',
      counterparty: r.client_name || 'לקוח',
      description: 'תקבול לקוח',
      net: gross,
      vat: 0,
      gross,
      allocation: 'הכנסות',
      sourceId: r.id,
      note: 'receipt',
    };
    if (MONTHS.includes(m)) byMonth[m]!.push(row);
  }

  const emc = await sql`
    SELECT year_month, SUM(known_amount::numeric) sum_known
    FROM employee_month_costs
    WHERE organization_id = ${ORG}::uuid AND status IN ('draft','applied','closed')
      AND year_month = ANY(${MONTHS})
    GROUP BY year_month ORDER BY year_month`;

  const out = {
    org: ORG,
    generatedAt: new Date().toISOString(),
    byMonth,
    dateUnknown,
    commitments,
    emcByMonth: Object.fromEntries(emc.map((r) => [r.year_month, Number(r.sum_known)])),
    totalsByMonth: Object.fromEntries(
      MONTHS.map((m) => {
        const rows = byMonth[m] ?? [];
        return [
          m,
          {
            paymentCount: rows.length,
            grossPaid: rows.reduce((s, r) => s + r.gross, 0),
            netPaid: rows.reduce((s, r) => s + r.net, 0),
            vatPaid: rows.reduce((s, r) => s + r.vat, 0),
          },
        ];
      }),
    ),
  };

  const path = resolve(process.cwd(), '.tools/org-all-payments-2026.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log('Wrote', path);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
