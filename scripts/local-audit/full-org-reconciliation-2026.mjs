/**
 * Cross-check: Excel payment export vs installment reconciliation vs EMC (read-only JSON).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(process.cwd());
const payments = JSON.parse(readFileSync(resolve(root, '.tools/org-all-payments-2026.json'), 'utf8'));
const inst = JSON.parse(readFileSync(resolve(root, '.tools/payment-reconciliation-2026.json'), 'utf8'));

const MONTHS = Object.keys(payments.totalsByMonth);
const rows = [];

for (const m of MONTHS) {
  const p = payments.totalsByMonth[m];
  const i = inst.monthly[m] ?? {};
  rows.push({
    month: m,
    allSourcesGrossPaid: round(p.grossPaid),
    allSourcesNetPaid: round(p.netPaid),
    installmentGrossVerified: round(i.grossPaidVerified ?? 0),
    installmentNetRecognized: round(i.netRecognized ?? 0),
    emcKnown: round(payments.emcByMonth[m] ?? 0),
    dateUnknownGross: round(i.dateUnknownGross ?? 0),
    paymentLineCount: p.paymentCount,
    gapInstallmentVsAllGross: round(p.grossPaid - (i.grossPaidVerified ?? 0)),
    note:
      Math.abs(p.grossPaid - (i.grossPaidVerified ?? 0)) > 0.05
        ? 'Expected: non-installment expenses + payroll + receipts in all-sources'
        : 'OK',
  });
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

const out = {
  org: payments.org,
  generatedAt: new Date().toISOString(),
  bmsPolicy: '8689 GROSS date-unknown (not in monthly recognized NET)',
  monthly: rows,
  dateUnknownExceptions: inst.exceptions ?? [],
};
writeFileSync(resolve(root, '.tools/full-org-reconciliation-2026.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
