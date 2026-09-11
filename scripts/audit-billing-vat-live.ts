/**
 * READ-ONLY live billing VAT audit for dashboard "חיובים ללקוח" reconciliation.
 *
 * Usage:
 *   npx tsx --tsconfig scripts/profile-tsconfig.json scripts/audit-billing-vat-live.ts
 *   npx tsx ... scripts/audit-billing-vat-live.ts --org=<uuid>
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import {
  aggregateBillingPosition,
  resolveBillingGrossAmount,
  signedBillingNetAmount,
} from '@/modules/billing/domain/outstanding';
import { getAdminDb } from '@/shared/db/client';
import { fromNumericString, type MoneyValue } from '@/shared/money';

dotenv.config({ path: '.env.local', override: true });

const realDbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!realDbUrl || /127\.0\.0\.1|localhost/.test(realDbUrl)) {
  throw new Error('Real DATABASE_URL required (not localhost)');
}
process.env.DATABASE_URL = realDbUrl;
process.env.DIRECT_DATABASE_URL = realDbUrl;

const TARGET_NET = process.env.AUDIT_TARGET_NET ?? '598400';
const orgArg = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1];

type Row = {
  id: string;
  organization_id: string;
  reference: string | null;
  issue_date: string;
  status: string;
  kind: string;
  subtotal_amount: string;
  tax_amount: string | null;
  total_amount: string;
  currency: string;
  vat_mode: string | null;
  source_kind: string | null;
  tax_snapshot: unknown;
};

function num(v: string | null | undefined): number {
  return v == null || v === '' ? 0 : Number(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyRow(row: Row, resolvedGross: number): {
  taxNull: boolean;
  taxZero: boolean;
  totalEqualsSubtotal: boolean;
  totalInconsistent: boolean;
  dataOk: boolean;
} {
  const sub = num(row.subtotal_amount);
  const tax = row.tax_amount == null ? null : num(row.tax_amount);
  const total = num(row.total_amount);
  const taxNull = row.tax_amount == null;
  const taxZero = tax === 0;
  const totalEqualsSubtotal = round2(total) === round2(sub);
  const expectedTotal = taxNull ? sub : round2(sub + (tax ?? 0));
  const totalInconsistent = !taxNull && Math.abs(total - expectedTotal) > 0.01;
  const dataOk =
    !totalInconsistent &&
    (taxNull
      ? totalEqualsSubtotal
      : Math.abs(resolvedGross - round2(sub + (tax ?? 0))) <= 0.01);
  return { taxNull, taxZero, totalEqualsSubtotal, totalInconsistent, dataOk };
}

function derivedVatRatePercent(sub: number, tax: number | null): string | null {
  if (tax == null || sub === 0) return null;
  return round2((tax / sub) * 100).toFixed(2);
}

async function findOrgByNet(admin: ReturnType<typeof getAdminDb>) {
  const rows = await admin.execute(sql`
    SELECT
      br.organization_id,
      o.name AS org_name,
      br.currency,
      SUM(
        CASE
          WHEN br.status IN ('void', 'draft') THEN 0
          WHEN br.kind = 'credit_note' THEN -br.subtotal_amount::numeric
          ELSE br.subtotal_amount::numeric
        END
      ) AS net_sum
    FROM billing_records br
    INNER JOIN organizations o ON o.id = br.organization_id
    WHERE br.archived_at IS NULL
    GROUP BY br.organization_id, o.name, br.currency
    HAVING ABS(
      SUM(
        CASE
          WHEN br.status IN ('void', 'draft') THEN 0
          WHEN br.kind = 'credit_note' THEN -br.subtotal_amount::numeric
          ELSE br.subtotal_amount::numeric
        END
      ) - ${TARGET_NET}::numeric
    ) < 1
    ORDER BY br.organization_id
    LIMIT 5
  `);
  return rows as { organization_id: string; org_name: string; currency: string; net_sum: string }[];
}

async function auditOrg(organizationId: string) {
  const { listPaidAmountRowsByBillingRecordIds } = await import('@/modules/billing');
  const admin = getAdminDb();

  const orgRow = await admin.execute(sql`
    SELECT id, name, base_currency FROM organizations WHERE id = ${organizationId} LIMIT 1
  `);
  const org = orgRow[0] as { id: string; name: string; base_currency: string } | undefined;
  if (!org) throw new Error(`Org not found: ${organizationId}`);

  const records = (await admin.execute(sql`
    SELECT
      id, organization_id, reference, issue_date, status, kind,
      subtotal_amount, tax_amount, total_amount, currency,
      source_kind, tax_snapshot
    FROM billing_records
    WHERE organization_id = ${organizationId}
      AND archived_at IS NULL
    ORDER BY issue_date, reference NULLS LAST, id
  `)) as Row[];

  const included = records.filter((r) => r.status !== 'void' && r.status !== 'draft');
  const currency = org.base_currency || included[0]?.currency || 'ILS';

  const recordIds = included.map((r) => r.id);
  const paymentRows =
    recordIds.length > 0
      ? await listPaidAmountRowsByBillingRecordIds(admin, organizationId, recordIds)
      : [];

  const paymentsByRecord = new Map<string, { amount: MoneyValue; status: 'recorded' | 'void' }[]>();
  for (const p of paymentRows) {
    const amt = fromNumericString(p.amount, p.currency);
    if (!amt) continue;
    const list = paymentsByRecord.get(p.billingRecordId) ?? [];
    list.push({ amount: amt, status: p.status });
    paymentsByRecord.set(p.billingRecordId, list);
  }

  let sumSubtotal = 0;
  let sumStoredTax = 0;
  let sumStoredTotal = 0;
  let sumResolvedGross = 0;
  let sumStoredGrossOld = 0;

  let rowsCorrect = 0;
  let rowsTaxNull = 0;
  let rowsTaxZero = 0;
  let rowsTotalEqSubtotalDespiteVat = 0;
  let rowsTotalInconsistent = 0;

  const detail: Record<string, unknown>[] = [];

  for (const row of included) {
    const subtotal = fromNumericString(row.subtotal_amount, row.currency)!;
    const tax =
      row.tax_amount != null && row.tax_amount !== ''
        ? fromNumericString(row.tax_amount, row.currency)
        : null;
    const total = fromNumericString(row.total_amount, row.currency)!;
    const resolved = resolveBillingGrossAmount({
      totalAmount: total,
      subtotalAmount: subtotal,
      taxAmount: tax,
    });

    const sign = row.kind === 'credit_note' ? -1 : 1;
    const signedSub = sign * num(row.subtotal_amount);
    const signedTax = sign * (tax ? num(tax.amount) : 0);
    const signedTotal = sign * num(row.total_amount);
    const signedResolved = sign * num(resolved.amount);

    sumSubtotal += signedSub;
    sumStoredTax += signedTax;
    sumStoredTotal += signedTotal;
    sumResolvedGross += signedResolved;
    sumStoredGrossOld += signedTotal;

    const cls = classifyRow(row, num(resolved.amount));
    if (cls.dataOk) rowsCorrect += 1;
    if (cls.taxNull) rowsTaxNull += 1;
    if (cls.taxZero) rowsTaxZero += 1;
    if (cls.totalEqualsSubtotal && tax && num(tax.amount) > 0.01) rowsTotalEqSubtotalDespiteVat += 1;
    if (cls.totalInconsistent) rowsTotalInconsistent += 1;

    detail.push({
      id: row.id,
      reference: row.reference,
      issueDate: row.issue_date,
      status: row.status,
      kind: row.kind,
      sourceKind: row.source_kind,
      subtotal: row.subtotal_amount,
      tax: row.tax_amount,
      total: row.total_amount,
      derivedVatRatePercent: derivedVatRatePercent(num(row.subtotal_amount), tax ? num(tax.amount) : null),
      resolvedGross: resolved.amount,
      storedGrossDelta: round2(num(resolved.amount) - num(row.total_amount)),
      flags: cls,
      hasTaxSnapshot: row.tax_snapshot != null,
    });
  }

  const aggregateInputs = included.map((row) => {
    const subtotal = fromNumericString(row.subtotal_amount, row.currency)!;
    const tax =
      row.tax_amount != null && row.tax_amount !== ''
        ? fromNumericString(row.tax_amount, row.currency)
        : null;
    const total = fromNumericString(row.total_amount, row.currency)!;
    return {
      kind: row.kind as 'invoice' | 'credit_note',
      status: row.status as 'finalized' | 'draft' | 'void',
      totalAmount: total,
      subtotalAmount: subtotal,
      taxAmount: tax,
      payments: paymentsByRecord.get(row.id) ?? [],
    };
  });

  const position = aggregateBillingPosition(aggregateInputs, currency);

  const netFromSigned = included.reduce((acc, row) => {
    const signed = signedBillingNetAmount({
      kind: row.kind as 'invoice' | 'credit_note',
      status: row.status as 'finalized' | 'draft' | 'void',
      totalAmount: fromNumericString(row.total_amount, row.currency)!,
      subtotalAmount: fromNumericString(row.subtotal_amount, row.currency)!,
    });
    return acc + (signed ? num(signed.amount) : 0);
  }, 0);

  const expectedGrossFromDocs = round2(sumSubtotal + sumStoredTax);
  const liveReconDiff = round2(num(position.invoiced.amount) - expectedGrossFromDocs);
  const oldDisplayGross = round2(sumStoredGrossOld);
  const newResolvedGross = round2(num(position.invoiced.amount));

  const billedNet = num(position.netInvoiced.amount);
  const billedGross = num(position.invoiced.amount);
  const paidNet = num(position.netPaid.amount);
  const paidGross = num(position.paid.amount);
  const openNet = num(position.netOutstanding.amount);
  const openGross = num(position.outstanding.amount);

  const report = {
    organization: { id: org.id, name: org.name, currency },
    billingRecordsIncluded: included.length,
    billingRecordsTotal: records.length,
    sums: {
      subtotal: round2(sumSubtotal),
      storedTax: round2(sumStoredTax),
      storedTotal: round2(sumStoredTotal),
      resolvedGross: newResolvedGross,
      manualResolvedGrossSum: round2(sumResolvedGross),
      oldStoredTotalAsGross: oldDisplayGross,
      expectedGrossFromSubtotalPlusStoredTax: expectedGrossFromDocs,
      dashboardNetViaAggregate: round2(billedNet),
      netViaManualSignedSum: round2(netFromSigned),
    },
    rowClassification: {
      correct: rowsCorrect,
      taxNull: rowsTaxNull,
      taxZero: rowsTaxZero,
      totalEqualsSubtotalDespiteVat: rowsTotalEqSubtotalDespiteVat,
      totalInconsistentWithSubtotalPlusTax: rowsTotalInconsistent,
    },
    exactCauseOf61233497:
      oldDisplayGross === 612334.97
        ? 'SUM(total_amount) on included records equals 612,334.97 — most rows have total=subtotal (no VAT in total); only rows with total>subtotal add VAT delta.'
        : `Stored total sum = ${oldDisplayGross} (target was 612,334.97 if matching prior UI)`,
    priorUiGross61233497Explanation: {
      formula: 'SUM(signed total_amount) excluding draft/void',
      value: oldDisplayGross,
      deltaVsNet: round2(oldDisplayGross - round2(sumSubtotal)),
      deltaVsResolvedGross: round2(newResolvedGross - oldDisplayGross),
    },
    expectedCorrectLiveGross: expectedGrossFromDocs,
    liveReconciliationDifference: liveReconDiff,
    positionReconciliation: {
      billed: { net: billedNet, gross: billedGross, vat: round2(billedGross - billedNet) },
      paid: { net: paidNet, gross: paidGross, vat: round2(paidGross - paidNet) },
      open: { net: openNet, gross: openGross, vat: round2(openGross - openNet) },
      billedNetMinusPaidNetEqualsOpenNet: round2(billedNet - paidNet - openNet),
      billedGrossMinusPaidGrossEqualsOpenGross: round2(billedGross - paidGross - openGross),
      netPlusVatEqualsGross: round2(billedNet + (billedGross - billedNet) - billedGross),
    },
    rowsWithResolvedGrossGreaterThanStoredTotal: detail.filter(
      (r) => Math.abs(Number((r as { storedGrossDelta: number }).storedGrossDelta)) > 0.01,
    ),
    rowsTaxNullButNonZeroSubtotal: detail.filter(
      (r) => (r.flags as { taxNull: boolean }).taxNull && Number(r.subtotal) !== 0,
    ),
    allRows: detail,
  };

  return report;
}

async function main() {
  const admin = getAdminDb();

  let orgId = orgArg;
  if (!orgId) {
    const matches = await findOrgByNet(admin);
    if (matches.length === 0) {
      console.error(`No org found with NET ≈ ${TARGET_NET}. Pass --org=<uuid>`);
      process.exit(1);
    }
    orgId = matches[0]!.organization_id;
    console.error(
      JSON.stringify({ autoSelectedOrg: matches[0] }, null, 2),
    );
  }

  const report = await auditOrg(orgId!);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
