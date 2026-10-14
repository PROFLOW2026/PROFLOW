import type { OrgContext } from '@/shared/auth/context';
import { businessDate, isBusinessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { addMoney, roundMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  listOrganizationRecognizedCostBreakdownInDateRange,
  sumOrganizationRecognizedCostsInDateRange,
  type RecognizedCostBreakdownLine,
} from '../data/expenses.repository';

export interface RecognizedCostBreakdownData {
  readonly currency: string;
  readonly period: { readonly fromDate: BusinessDate; readonly toDate: BusinessDate };
  readonly lines: readonly RecognizedCostBreakdownLine[];
  readonly totalNet: MoneyValue;
  readonly totalGross: MoneyValue;
  readonly totalVat: MoneyValue;
  readonly kpiNet: MoneyValue;
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

export async function getRecognizedCostBreakdown(
  context: OrgContext,
  options: { readonly fromDate?: string | null; readonly toDate?: string | null } = {},
): Promise<RecognizedCostBreakdownData | null> {
  if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) {
    return null;
  }
  const currency = context.organization.baseCurrency.toUpperCase();
  const today = todayInTimeZone(context.organization.timezone);
  const period = resolvePeriod(today, options.fromDate, options.toDate);

  const [lines, kpiNet] = await Promise.all([
    listOrganizationRecognizedCostBreakdownInDateRange(
      context.db,
      context.organizationId,
      currency,
      period.fromDate,
      period.toDate,
    ),
    sumOrganizationRecognizedCostsInDateRange(
      context.db,
      context.organizationId,
      currency,
      period.fromDate,
      period.toDate,
    ),
  ]);

  let totalNet = zeroMoney(currency);
  let totalGross = zeroMoney(currency);
  let totalVat = zeroMoney(currency);
  for (const line of lines) {
    if (line.estimate || line.undatedApBill) continue;
    totalNet = addMoney(totalNet, line.net);
    totalGross = addMoney(totalGross, line.gross);
    totalVat = addMoney(totalVat, line.vat);
  }

  return {
    currency,
    period,
    lines,
    totalNet: roundMoney(totalNet),
    totalGross: roundMoney(totalGross),
    totalVat: roundMoney(totalVat),
    kpiNet,
  };
}
