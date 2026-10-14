/**
 * READ-ONLY Production export — all verified payments Jan–Oct 2026 (org 8ef9…).
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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

const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');

const sql = postgres(url, { max: 1, prepare: false });

function ym(d) {
  return d.slice(0, 7);
}

function netFromGross(g, netT, grossT) {
  return grossT > 0 ? (g * netT) / grossT : 0;
}

function parseSlice(after, installmentCount) {
  const g = Number(after.paidGrossAmount ?? after.paid_gross_amount ?? 0);
  if (!(g > 0)) return null;
  const paidAt = after.paidAt ?? after.paid_at ?? null;
  const idx =
    typeof after.installmentIndex === 'number'
      ? after.installmentIndex
      : typeof after.installment_index === 'number'
        ? after.installment_index
        : null;
  const source = after.source ?? null;
  if (idx != null && idx >= 0) {
    if (!paidAt) return { kind: 'date_unknown', gross: g };
    return { kind: 'verified', paidAt, gross: g, idx };
  }
  const manualMulti = installmentCount > 1 && (source === 'manual' || source == null);
  if (manualMulti || !paidAt) return { kind: 'date_unknown', gross: g };
  return { kind: 'verified', paidAt, gross: g, idx: -1 };
}

function paymentConfirmedAudits(audits) {
  const sorted = [...audits].sort((a, b) =>
    String(a.created_at ?? a.createdAt).localeCompare(String(b.created_at ?? b.createdAt)),
  );
  const voidAt = sorted
    .filter((a) => a.action === 'expense.payment_confirmation_voided')
    .map((a) => String(a.created_at ?? a.createdAt));
  const lastVoid = voidAt.length ? voidAt[voidAt.length - 1] : null;
  const out = [];
  for (const a of sorted) {
    if (a.action !== 'expense.payment_confirmed') continue;
    const created = String(a.created_at ?? a.createdAt);
    const after = a.after ?? {};
    const idx =
      typeof after.installmentIndex === 'number'
        ? after.installmentIndex
        : typeof after.installment_index === 'number'
          ? after.installment_index
          : null;
    if (lastVoid && idx == null && created <= lastVoid) continue;
    out.push(a);
  }
  return out;
}

const byMonth = Object.fromEntries(MONTHS.map((m) => [m, []]));
const dateUnknown = [];
const commitments = [];

const expenses = await sql`
  SELECT e.id, e.supplier_name, e.description, e.status, e.expense_date::text,
         e.installment_count, e.installments_paid_count,
         e.paid_gross_amount::text, e.paid_at::text,
         e.net_amount::text, e.gross_amount::text, e.tax_amount::text,
         e.payment_status, e.allocation_intent, p.name AS project_name
  FROM expenses e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL AND e.status = 'finalized'
    AND e.expense_date >= '2026-01-01' AND e.expense_date < '2026-11-01'
  ORDER BY e.expense_date`;

const ledgerPayments = await sql`
  SELECT expense_id, installment_index, actual_paid_at::text, gross_paid::text, net_paid::text, vat_paid::text
  FROM expense_installment_payments
  WHERE organization_id = ${ORG}::uuid AND status = 'paid'
  ORDER BY expense_id, installment_index`;

const ledgerByExpense = new Map();
for (const row of ledgerPayments) {
  const list = ledgerByExpense.get(row.expense_id) ?? [];
  list.push(row);
  ledgerByExpense.set(row.expense_id, list);
}

const ids = expenses.map((e) => e.id).filter((id) => !VOID_TECHNICAL_IDS.has(id));
const auditRows =
  ids.length === 0
    ? []
    : await sql`
  SELECT entity_id, action, created_at, after
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid AND entity_type = 'expense'
    AND entity_id = ANY(${ids}::uuid[])
    AND action IN ('expense.payment_confirmed', 'expense.payment_confirmation_voided')
  ORDER BY created_at`;

const auditsBy = new Map();
for (const a of auditRows) {
  const list = auditsBy.get(a.entity_id) ?? [];
  list.push({
    action: a.action,
    created_at: new Date(a.created_at).toISOString(),
    after: a.after,
  });
  auditsBy.set(a.entity_id, list);
}

for (const e of expenses) {
  if (VOID_TECHNICAL_IDS.has(e.id)) continue;
  const netT = Number(e.net_amount);
  const grossT = Number(e.gross_amount);
  const supplier = e.supplier_name || e.description || '—';
  const desc = e.description || 'הוצאה';
  const alloc = e.project_name
    ? `פרויקט: ${e.project_name}`
    : e.allocation_intent === 'auto_pool'
      ? 'תקורה / מאגר'
      : e.allocation_intent || '—';
  const inst = Number(e.installment_count ?? 1);

  if (inst > 1) {
    const ledger = ledgerByExpense.get(e.id) ?? [];
    let dateUnk = 0;
    if (ledger.length > 0) {
      for (const lp of ledger) {
        const g = Number(lp.gross_paid);
        const n = Number(lp.net_paid);
        const v = Number(lp.vat_paid);
        const paidAt = lp.actual_paid_at.slice(0, 10);
        const m = ym(paidAt);
        const row = {
          paymentDate: paidAt,
          yearMonth: m,
          kind: 'expense',
          counterparty: supplier,
          description: `${desc} (פריסה)`,
          net: n,
          vat: v,
          gross: g,
          allocation: alloc,
          sourceId: e.id,
          note: `פעימה ${lp.installment_index + 1} (ledger)`,
        };
        if (MONTHS.includes(m)) byMonth[m].push(row);
      }
    } else {
      const confirmed = paymentConfirmedAudits(auditsBy.get(e.id) ?? []);
      const slices = [];
      for (const a of confirmed) {
        const sl = parseSlice(a.after ?? {}, inst);
        if (sl) slices.push(sl);
      }
      for (const sl of slices) {
        if (sl.kind === 'verified') {
          const g = sl.gross;
          const n = netFromGross(g, netT, grossT);
          const m = ym(sl.paidAt);
          const row = {
            paymentDate: sl.paidAt.slice(0, 10),
            yearMonth: m,
            kind: 'expense',
            counterparty: supplier,
            description: `${desc} (פריסה)`,
            net: n,
            vat: g - n,
            gross: g,
            allocation: alloc,
            sourceId: e.id,
            note: `פעימה ${sl.idx >= 0 ? sl.idx + 1 : 'מרוכז'}`,
          };
          if (MONTHS.includes(m)) byMonth[m].push(row);
        } else {
          dateUnk += sl.gross;
        }
      }
      const paidGross = Number(e.paid_gross_amount ?? 0);
      const verifiedSum = slices.filter((s) => s.kind === 'verified').reduce((s, x) => s + x.gross, 0);
      if (dateUnk < paidGross - verifiedSum - 0.01) dateUnk = paidGross - verifiedSum;
      if (dateUnk > 0.01) {
        dateUnknown.push({
          paymentDate: e.paid_at?.slice(0, 10) ?? null,
          kind: 'expense_date_unknown',
          counterparty: supplier,
          description: desc,
          net: netFromGross(dateUnk, netT, grossT),
          vat: dateUnk - netFromGross(dateUnk, netT, grossT),
          gross: dateUnk,
          allocation: alloc,
          sourceId: e.id,
          note: 'PAID_DATE_UNKNOWN',
        });
      }
    }
    const paidGross = Number(e.paid_gross_amount ?? 0);
    const open = grossT - paidGross;
    if (open > 0.01) {
      commitments.push({
        counterparty: supplier,
        description: `${desc} — יתרה`,
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
  if (paidGross <= 0) continue;
  const paidAt = e.paid_at?.slice(0, 10) ?? null;
  const g = paidGross;
  const n = netFromGross(g, netT, grossT);
  if (!paidAt) {
    dateUnknown.push({
      paymentDate: null,
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
  const row = {
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
  if (MONTHS.includes(m)) byMonth[m].push(row);
}

const payroll = await sql`
  SELECT p.id, e.name, p.year_month, p.paid_at::text, p.paid_amount::text
  FROM employee_payroll_payments p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.organization_id = ${ORG}::uuid AND p.voided_at IS NULL
    AND p.paid_at IS NOT NULL
    AND p.paid_at >= '2026-01-01' AND p.paid_at < '2026-11-01'
  ORDER BY p.paid_at`;

for (const p of payroll) {
  const paidAt = p.paid_at.slice(0, 10);
  const m = ym(paidAt);
  const gross = Number(p.paid_amount ?? 0);
  if (gross <= 0) continue;
  const row = {
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
  if (MONTHS.includes(m)) byMonth[m].push(row);
}

const receipts = await sql`
  SELECT p.id, p.payment_date::text, p.amount::text, c.name AS client_name
  FROM payments p
  LEFT JOIN clients c ON c.id = p.client_id
  WHERE p.organization_id = ${ORG}::uuid AND p.voided_at IS NULL
    AND p.payment_date >= '2026-01-01' AND p.payment_date < '2026-11-01'
  ORDER BY p.payment_date`;

for (const r of receipts) {
  const paidAt = r.payment_date.slice(0, 10);
  const m = ym(paidAt);
  const gross = Number(r.amount);
  const row = {
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
  if (MONTHS.includes(m)) byMonth[m].push(row);
}

const emc = await sql`
  SELECT year_month, SUM(known_amount::numeric) sum_known
  FROM employee_month_costs
  WHERE organization_id = ${ORG}::uuid AND status IN ('draft','applied','closed')
    AND year_month = ANY(${MONTHS})
  GROUP BY year_month ORDER BY year_month`;

function sumKind(rows, kind) {
  const filtered = kind ? rows.filter((r) => r.kind === kind) : rows;
  return {
    paymentCount: filtered.length,
    gross: filtered.reduce((s, r) => s + r.gross, 0),
    net: filtered.reduce((s, r) => s + r.net, 0),
    vat: filtered.reduce((s, r) => s + r.vat, 0),
  };
}

const emcByMonth = Object.fromEntries(emc.map((r) => [r.year_month, Number(r.sum_known)]));

const monthlyTruth = Object.fromEntries(
  MONTHS.map((m) => {
    const rows = byMonth[m];
    const expensesOut = sumKind(rows, 'expense');
    const payrollOut = sumKind(rows, 'payroll');
    const receiptsIn = sumKind(rows, 'customer_receipt');
    return [
      m,
      {
        expensesOut,
        payrollOut,
        receiptsIn,
        outgoingPaymentsGross: expensesOut.gross + payrollOut.gross,
        outgoingPaymentsNet: expensesOut.net + payrollOut.net,
        outgoingPaymentsVat: expensesOut.vat + payrollOut.vat,
        emc: emcByMonth[m] ?? 0,
      },
    ];
  }),
);

/** @deprecated mixed all flows — use monthlyTruth for reporting */
const totalsByMonth = Object.fromEntries(
  MONTHS.map((m) => {
    const t = monthlyTruth[m];
    return [
      m,
      {
        paymentCount:
          t.expensesOut.paymentCount + t.payrollOut.paymentCount + t.receiptsIn.paymentCount,
        grossPaid: t.outgoingPaymentsGross + t.receiptsIn.gross,
        netPaid: t.outgoingPaymentsNet + t.receiptsIn.net,
        vatPaid: t.outgoingPaymentsVat + t.receiptsIn.vat,
      },
    ];
  }),
);

const out = {
  org: ORG,
  generatedAt: new Date().toISOString(),
  schemaVersion: 2,
  byMonth,
  monthlyTruth,
  dateUnknown,
  orgLevel: {
    dateUnknownGross: dateUnknown.reduce((s, r) => s + r.gross, 0),
    dateUnknownNet: dateUnknown.reduce((s, r) => s + r.net, 0),
    dateUnknownVat: dateUnknown.reduce((s, r) => s + r.vat, 0),
    paymentCount: dateUnknown.length,
  },
  commitments,
  emcByMonth,
  totalsByMonth,
};

const outPath = resolve(process.cwd(), '.tools/org-all-payments-2026.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath);
await sql.end();
