/**
 * Selected-month cash in, cash out, and still-due balances.
 * Collections stay on the billing payment date. Outgoing cash stays on payment date.
 * Due balances stay on the stored due date. Recognized cost is not loaded here.
 */

import { computeBillRemainingOutstanding } from '@/modules/ap';
import type { OrgContext } from '@/shared/auth/context';
import type { BusinessDate } from '@/shared/dates';
import { isPositiveMoney, money, type MoneyValue } from '@/shared/money';
import type { RevenueTriplet } from '@/modules/billing/domain/revenue-position';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  composeMonthCashFlow,
  type MonthCashFlow,
  type MonthCashPaidLine,
  type MonthExpenseCashSnapshot,
  type MonthPayrollCashSnapshot,
} from '../domain/month-cash-flow';
import {
  apExpectedLineFromBill,
  loadMonthAdvanceCashSnapshots,
  loadMonthApBillsDue,
  loadMonthApPayments,
  loadMonthExpenseCashSnapshots,
} from '../data/month-cash-flow.repository';
import type { MonthAdvanceCashSnapshot } from '../domain/month-cash-flow';
import { loadCanonicalPayrollCashSnapshots } from './canonical-payroll-cash';

export interface MonthCashFlowBundle {
  readonly currency: string;
  readonly canReadCosts: boolean;
  readonly canReadAp: boolean;
  readonly expenses: readonly MonthExpenseCashSnapshot[];
  readonly apPayments: readonly MonthCashPaidLine[];
  readonly apBills: Awaited<ReturnType<typeof loadMonthApBillsDue>>;
  readonly payroll: readonly MonthPayrollCashSnapshot[];
  readonly advances: readonly MonthAdvanceCashSnapshot[];
}

/** Load cash-flow inputs once for a date range (e.g. full calendar year). */
export async function loadMonthCashFlowBundle(
  context: OrgContext,
  range: { readonly from: BusinessDate; readonly to: BusinessDate },
): Promise<MonthCashFlowBundle> {
  const currency = context.organization.baseCurrency.toUpperCase();
  const canReadCosts = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);

  const { getOrgFinancialPolicies } = await import('@/modules/tenancy/application/org-financial-policies');
  const policies = canReadCosts ? await getOrgFinancialPolicies(context) : null;

  const [apPayments, apBills, expenses, payroll, advances] = await Promise.all([
    canReadAp
      ? loadMonthApPayments(context.db, context.organizationId, currency, range.from, range.to)
      : Promise.resolve([]),
    canReadAp
      ? loadMonthApBillsDue(context.db, context.organizationId, currency, range.from, range.to)
      : Promise.resolve([]),
    canReadCosts
      ? loadMonthExpenseCashSnapshots(context.db, context.organizationId, currency)
      : Promise.resolve([]),
    canReadCosts && policies
      ? loadCanonicalPayrollCashSnapshots(context.db, context.organizationId, currency, {
          salaryPaymentDay: policies.salaryPaymentDay,
          from: range.from,
          to: range.to,
        })
      : Promise.resolve([]),
    canReadAp
      ? loadMonthAdvanceCashSnapshots(
          context.db,
          context.organizationId,
          currency,
          range.from,
          range.to,
        )
      : Promise.resolve([]),
  ]);

  return {
    currency,
    canReadCosts,
    canReadAp,
    expenses,
    apPayments,
    apBills,
    payroll,
    advances,
  };
}

function isInRange(date: BusinessDate, from: BusinessDate, to: BusinessDate): boolean {
  return date >= from && date <= to;
}

export function composeMonthCashFlowFromBundle(
  bundle: MonthCashFlowBundle,
  input: {
    readonly from: BusinessDate;
    readonly to: BusinessDate;
    readonly collectionsActual: MoneyValue;
    readonly collectionsDisplay?: RevenueTriplet;
  },
): MonthCashFlow {
  const apPayments = bundle.apPayments.filter((line) =>
    isInRange(line.paymentDate, input.from, input.to),
  );
  const apBills = bundle.apBills.filter((bill) => isInRange(bill.dueDate, input.from, input.to));
  const advances = bundle.advances.filter(
    (row) => row.paidDate != null && isInRange(row.paidDate, input.from, input.to),
  );

  const apExpected = apBills.flatMap((bill) => {
    const remaining = computeBillRemainingOutstanding({
      currency: bill.currency,
      billStatus: bill.status,
      billTotal: bill.totalAmount,
      priorAppliedAmounts: [bill.appliedPayments],
      priorCreditAmounts: [bill.appliedCredits],
      priorRetentionHeldRemaining: bill.retentionHeldRemaining,
    });
    if (!isPositiveMoney(remaining)) return [];
    const paid = money(bill.appliedPayments, bill.currency);
    return [
      apExpectedLineFromBill(bill, remaining, isPositiveMoney(paid) ? 'partial' : 'unpaid'),
    ];
  });

  const normalizedPayments = apPayments.map((line) => ({
    ...line,
    amount: money(line.amount.amount, line.amount.currency),
  }));

  return composeMonthCashFlow({
    currency: bundle.currency,
    from: input.from,
    to: input.to,
    collectionsActual: input.collectionsActual,
    collectionsDisplay: input.collectionsDisplay,
    apPayments: normalizedPayments,
    apExpected,
    expenses: bundle.expenses,
    payroll: bundle.payroll,
    advances,
  });
}

export async function getMonthCashFlow(
  context: OrgContext,
  input: {
    readonly from: BusinessDate;
    readonly to: BusinessDate;
    readonly collectionsActual: MoneyValue;
    readonly collectionsDisplay?: RevenueTriplet;
  },
): Promise<MonthCashFlow> {
  const bundle = await loadMonthCashFlowBundle(context, { from: input.from, to: input.to });
  return composeMonthCashFlowFromBundle(bundle, input);
}
