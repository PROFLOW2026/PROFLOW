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

const data = JSON.parse(
  readFileSync(resolve(process.cwd(), '.tools/payment-audit-org-installments.json'), 'utf8'),
);

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
    if (!paidAt) return { kind: 'date_unknown', gross: g, installmentIndex: idx };
    return { kind: 'verified', paidAt, gross: g, installmentIndex: idx };
  }

  const manualMulti = installmentCount > 1 && (source === 'manual' || source == null);
  if (manualMulti) {
    return { kind: 'date_unknown', gross: g, installmentIndex: -1, note: 'manual_lump_multi' };
  }
  if (!paidAt) return { kind: 'date_unknown', gross: g, installmentIndex: -1 };
  return { kind: 'verified', paidAt, gross: g, installmentIndex: -1 };
}

const monthly = Object.fromEntries(
  MONTHS.map((m) => [
    m,
    { netRecognized: 0, grossPaidVerified: 0, vatRecognized: 0 },
  ]),
);
let orgDateUnknownGross = 0;

const exceptions = [];

const transactions = data.report.map((e) => {
  const netT = Number(e.net_amount);
  const grossT = Number(e.gross_amount);
  const instCount = Number(e.installment_count ?? 1);
  const audits = e.audits ?? [];
  const sorted = [...audits].sort((a, b) =>
    String(a.created_at ?? a.createdAt).localeCompare(String(b.created_at ?? b.createdAt)),
  );
  const voidAt = sorted
    .filter((a) => a.action === 'expense.payment_confirmation_voided')
    .map((a) => String(a.created_at ?? a.createdAt));
  const lastVoid = voidAt.length ? voidAt[voidAt.length - 1] : null;
  const slices = [];
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
    const sl = parseSlice(a.after ?? {}, instCount);
    if (sl) slices.push(sl);
  }

  const paidGross = Number(e.paid_gross_amount ?? 0);
  let verifiedGross = 0;
  let dateUnknownGross = 0;
  const monthBreakdown = {};

  for (const sl of slices) {
    if (sl.kind === 'verified') {
      verifiedGross += sl.gross;
      const m = ym(sl.paidAt);
      if (MONTHS.includes(m)) {
        monthBreakdown[m] ??= { net: 0, gross: 0, vat: 0 };
        const net = netFromGross(sl.gross, netT, grossT);
        const vat = sl.gross - net;
        monthBreakdown[m].gross += sl.gross;
        monthBreakdown[m].net += net;
        monthBreakdown[m].vat += vat;
        monthly[m].grossPaidVerified += sl.gross;
        monthly[m].netRecognized += net;
        monthly[m].vatRecognized += vat;
      }
    } else {
      dateUnknownGross += sl.gross;
    }
  }

  const hasAnyLump = slices.some((s) => s.installmentIndex === -1);
  if (verifiedGross >= paidGross - 0.01) {
    dateUnknownGross = slices
      .filter((s) => s.kind === 'date_unknown')
      .reduce((sum, s) => sum + s.gross, 0);
  } else {
    const unallocated = Math.max(0, paidGross - verifiedGross - dateUnknownGross);
    if (!hasAnyLump && unallocated > 0.01) {
      dateUnknownGross += unallocated;
    }
  }
  dateUnknownGross = Math.min(dateUnknownGross, paidGross);

  if (dateUnknownGross > 0.01) {
    exceptions.push({
      id: e.id,
      supplier: e.supplier_name,
      dateUnknownGross,
      dateUnknownNet: netFromGross(dateUnknownGross, netT, grossT),
      status: verifiedGross > 0.01 ? 'PARTIALLY_VERIFIED' : 'PAID_DATE_UNKNOWN',
    });
    orgDateUnknownGross += dateUnknownGross;
  }

  let status = 'UNPAID';
  if (paidGross > 0) {
    if (dateUnknownGross > 0.01 && verifiedGross > 0.01) status = 'PARTIALLY_VERIFIED';
    else if (dateUnknownGross > 0.01) status = 'PAID_DATE_UNKNOWN';
    else status = 'PAID_VERIFIED';
  }

  return {
    id: e.id,
    supplier: e.supplier_name,
    status,
    installments: instCount,
    paidCount: e.installments_paid_count,
    paidGross,
    verifiedGross,
    dateUnknownGross,
    openGross: grossT - paidGross,
    auditCount: audits.filter((a) => a.action === 'expense.payment_confirmed').length,
    monthBreakdown,
  };
});

const out = {
  org: ORG,
  generatedAt: new Date().toISOString(),
  policy: 'manual_lump_multi_installment => PAID_DATE_UNKNOWN',
  monthly,
  orgLevel: {
    dateUnknownGross: orgDateUnknownGross,
    note: 'PAID_DATE_UNKNOWN is org-level; not attributed to October paid totals',
  },
  exceptions,
  transactions,
};
writeFileSync(resolve(process.cwd(), '.tools/payment-reconciliation-2026.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
