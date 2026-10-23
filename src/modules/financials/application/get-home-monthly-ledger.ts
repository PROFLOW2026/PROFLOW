import { and, eq, isNull } from 'drizzle-orm';
import { apBills, apPaymentApplications, apPayments, vendors } from '@drizzle/schema';
import { listBillingRecords, listPaymentApplications } from '@/modules/billing';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { fromNumericString, money, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadAllPayrollCashSnapshots } from '../data/month-cash-flow.repository';
import { listOrganizationRecognizedCostBreakdownInDateRange } from '../data/expenses.repository';
import { sumCollectionTripletsInDateRange } from '../data/billing.repository';
import {
  composeHomeMonthlyLedger,
  monthAsOf,
  yearMonthsThrough,
  type HomeMonthlyLedger,
  type LedgerApFact,
  type LedgerBillingFact,
  type LedgerCashLine,
  type LedgerExpenseFact,
} from '../domain/home-monthly-ledger';
import {
  composeMonthCashFlowFromBundle,
  loadMonthCashFlowBundle,
} from './get-month-cash-flow';

const PAGE = 200;

async function listAllBilling(context: OrgContext): Promise<BillingRecordSummary[]> {
  const all: BillingRecordSummary[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await listBillingRecords(context, { filter: 'all', limit: PAGE, offset });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

async function listAllApplications(context: OrgContext): Promise<PaymentApplicationRow[]> {
  const all: PaymentApplicationRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await listPaymentApplications(context, { limit: PAGE, offset });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all.filter((row) => row.status !== 'void');
}

export async function loadHomeMonthlyLedger(
  context: OrgContext,
  totals: {
    readonly dashboardCollectedNet: MoneyValue | null;
    readonly dashboardCashOutNet: MoneyValue | null;
  },
): Promise<HomeMonthlyLedger | null> {
  const canReadCosts = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  if (!canReadCosts && !canReadBilling) return null;

  const currency = context.organization.baseCurrency.toUpperCase();
  const today = todayInTimeZone(context.organization.timezone);
  const start = businessDate('2026-01-01');
  const months = yearMonthsThrough('2026-01', today.slice(0, 7));

  const bundle = canReadCosts
    ? await loadMonthCashFlowBundle(context, { from: start, to: today })
    : null;
  const payroll = canReadCosts
    ? await loadAllPayrollCashSnapshots(context.db, context.organizationId, currency)
    : [];
  const costs = canReadCosts
    ? await listOrganizationRecognizedCostBreakdownInDateRange(
        context.db,
        context.organizationId,
        currency,
        start,
        today,
      )
    : [];

  const billingRows = canReadBilling ? await listAllBilling(context) : [];
  const applications = canReadBilling ? await listAllApplications(context) : [];
  const applicationsByRecord = new Map<string, PaymentApplicationRow[]>();
  for (const row of applications) {
    const list = applicationsByRecord.get(row.billingRecordId) ?? [];
    list.push(row);
    applicationsByRecord.set(row.billingRecordId, list);
  }

  const collections = canReadBilling
    ? await Promise.all(
        months.map(async (yearMonth) => {
          const asOf = monthAsOf(yearMonth, today);
          const triplet = await sumCollectionTripletsInDateRange(
            context.db,
            context.organizationId,
            currency,
            businessDate(`${yearMonth}-01`),
            asOf,
          );
          return [yearMonth, triplet] as const;
        }),
      )
    : [];

  const cashLines: LedgerCashLine[] = [];
  const expenses: LedgerExpenseFact[] = [];
  if (bundle) {
    for (const yearMonth of months) {
      const flow = composeMonthCashFlowFromBundle(bundle, {
        from: businessDate(`${yearMonth}-01`),
        to: monthAsOf(yearMonth, today),
        collectionsActual: zeroMoney(currency),
      });
      for (const paid of flow.paidLines) {
        const payrollId = paid.id.startsWith('payroll:') ? paid.id.slice('payroll:'.length) : null;
        const payrollRow = payrollId ? payroll.find((row) => row.id === payrollId) : undefined;
        const expenseId = paid.id.startsWith('expense:')
          ? paid.id.slice('expense:'.length).split(':')[0]
          : null;
        cashLines.push({
          id: paid.id,
          source: paid.source,
          name: paid.party,
          document: paid.document,
          date: paid.paymentDate,
          net: paid.display?.net ?? money(paid.amount.amount, paid.amount.currency),
          gross: paid.display?.gross ?? money(paid.amount.amount, paid.amount.currency),
          href: payrollRow?.employeeId
            ? `/workforce/employees/${payrollRow.employeeId}`
            : expenseId
              ? `/expenses/${expenseId}`
              : null,
        });
      }
    }
    for (const row of bundle.expenses) {
      const gross = fromNumericString(row.grossAmount, currency);
      const net = fromNumericString(row.netAmount ?? row.grossAmount, currency);
      if (!gross || !net) continue;
      expenses.push({
        id: row.id,
        name: row.party || row.document,
        expenseDate: row.expenseDate,
        dueDate: row.dueDate,
        net,
        gross,
        href: `/expenses/${row.id}`,
        voided: row.voided,
      });
    }
  }

  const apBills = canReadAp ? await loadApFacts(context, currency) : [];

  const billing: LedgerBillingFact[] = billingRows
    .filter((row) => row.totalAmount.currency.toUpperCase() === currency)
    .map((row) => ({
      id: row.id,
      reference: row.reference,
      clientName: row.clientName ?? null,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      status: row.status,
      kind: row.kind,
      subtotalAmount: row.subtotalAmount ?? row.totalAmount,
      taxAmount: row.taxAmount ?? null,
      totalAmount: row.totalAmount,
      retentionHeldRemaining: row.retentionHeldRemaining ?? null,
      applications: (applicationsByRecord.get(row.id) ?? []).map((payment) => ({
        id: payment.id,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        basis: payment.paymentAmountBasis ?? 'net',
        status: payment.status === 'void' ? 'void' as const : 'recorded' as const,
      })),
    }));

  return composeHomeMonthlyLedger({
    currency,
    today,
    billingLoaded: canReadBilling,
    cashLoaded: canReadCosts,
    costLoaded: canReadCosts,
    billing,
    collectionsByMonth: Object.fromEntries(collections),
    cashLines,
    costs: costs
      .filter((row) => !row.undatedApBill)
      .map((row) => ({
        id: row.id,
        yearMonth: row.yearMonth,
        kind: row.sourceKind,
        name: row.party || row.description,
        net: row.net,
        gross: row.gross,
        href: row.href,
        estimate: row.estimate,
      })),
    payroll: payroll.map((row) => ({
      id: row.id,
      name: row.party,
      yearMonth: row.payrollPeriod ?? row.dueDate?.slice(0, 7) ?? '',
      dueDate: row.dueDate,
      paidAt: row.paidAt,
      expected: fromNumericString(row.expectedAmount, currency) ?? zeroMoney(currency),
      paid: fromNumericString(row.paidAmount ?? '0', currency) ?? zeroMoney(currency),
      href: row.employeeId ? `/workforce/employees/${row.employeeId}` : null,
      voided: row.voided,
    })),
    expenses,
    apBills,
    dashboardCollectedNet: totals.dashboardCollectedNet,
    dashboardCashOutNet: totals.dashboardCashOutNet,
  });
}

async function loadApFacts(context: OrgContext, currency: string): Promise<LedgerApFact[]> {
  const bills = await context.db
    .select({
      id: apBills.id,
      reference: apBills.reference,
      vendorName: vendors.name,
      billDate: apBills.billDate,
      dueDate: apBills.dueDate,
      status: apBills.status,
      netAmount: apBills.netAmount,
      grossAmount: apBills.grossAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .leftJoin(vendors, eq(vendors.id, apBills.vendorId))
    .where(
      and(
        eq(apBills.organizationId, context.organizationId),
        eq(apBills.currency, currency),
        isNull(apBills.archivedAt),
      ),
    );
  const applications = await context.db
    .select({
      billId: apPaymentApplications.apBillId,
      appliedAmount: apPaymentApplications.appliedAmount,
      paymentDate: apPayments.paymentDate,
      status: apPayments.status,
    })
    .from(apPaymentApplications)
    .innerJoin(apPayments, eq(apPayments.id, apPaymentApplications.apPaymentId))
    .where(eq(apPaymentApplications.organizationId, context.organizationId));

  return bills.flatMap((bill) => {
    const net = fromNumericString(bill.netAmount, bill.currency);
    const gross = fromNumericString(bill.grossAmount, bill.currency);
    if (!net || !gross) return [];
    return [
      {
        id: bill.id,
        name: bill.vendorName?.trim() || bill.reference?.trim() || bill.id,
        billDate: bill.billDate ? businessDate(bill.billDate) : null,
        dueDate: bill.dueDate ? businessDate(bill.dueDate) : null,
        status: bill.status,
        net,
        gross,
        href: `/procurement/ap`,
        applications: applications
          .filter((row) => row.billId === bill.id && row.status === 'recorded')
          .flatMap((row) => {
            const amount = fromNumericString(row.appliedAmount, currency);
            if (!amount) return [];
            return [{ date: businessDate(row.paymentDate), gross: amount }];
          }),
      },
    ];
  });
}
