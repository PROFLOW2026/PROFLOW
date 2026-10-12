import type { OrgContext } from '@/shared/auth/context';
import { businessDate, isBusinessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { MonthCashFlow, MonthCashPaidLine } from '../domain/month-cash-flow';
import { getMonthCashFlow } from './get-month-cash-flow';

export interface CashPaidBreakdownData {
  readonly currency: string;
  readonly period: { readonly fromDate: BusinessDate; readonly toDate: BusinessDate };
  readonly flow: MonthCashFlow;
  readonly paidLines: readonly MonthCashPaidLine[];
  readonly kpiPaid: MoneyValue;
}

function resolvePeriod(
  today: BusinessDate,
  fromDate?: string | null,
  toDate?: string | null,
): { fromDate: BusinessDate; toDate: BusinessDate } {
  const from = businessDate(
    fromDate && isBusinessDate(fromDate) ? fromDate : `${today.slice(0, 7)}-01`,
  );
  const to = toDate && isBusinessDate(toDate) ? businessDate(toDate) : today;
  if (from > to) return { fromDate: to, toDate: from };
  return { fromDate: from, toDate: to };
}

export async function getCashPaidBreakdown(
  context: OrgContext,
  options: { readonly fromDate?: string | null; readonly toDate?: string | null } = {},
): Promise<CashPaidBreakdownData | null> {
  const canReadCosts = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  if (!canReadCosts && !canReadAp) {
    return null;
  }

  const currency = context.organization.baseCurrency.toUpperCase();
  const today = todayInTimeZone(context.organization.timezone);
  const period = resolvePeriod(today, options.fromDate, options.toDate);

  const flow = await getMonthCashFlow(context, {
    from: period.fromDate,
    to: period.toDate,
    collectionsActual: zeroMoney(currency),
  });

  return {
    currency,
    period,
    flow,
    paidLines: flow.paidLines,
    kpiPaid: flow.paidActual,
  };
}
