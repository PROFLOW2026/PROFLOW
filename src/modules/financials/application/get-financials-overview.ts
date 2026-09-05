/**
 * Owner monthly / period business view.
 * Period filters flow through recognized cost, cash paid, billed, and collected.
 * Open payables, commitments, AR, and overdue are point-in-time snapshots.
 */

import { getOrganizationApPayables, sumApPaymentsMadeInDateRange } from '@/modules/ap';
import { listBillingRecords, computeReceivablesSummary } from '@/modules/billing';
import { sumPaidSubcontractAdvancesInDateRange } from '@/modules/vendors';
import type { OrgContext } from '@/shared/auth/context';
import {
  addDays,
  businessDate,
  isBusinessDate,
  todayInTimeZone,
  type BusinessDate,
} from '@/shared/dates';
import { addMoney, fromNumericString, money, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { sumCollectionsInDateRange, sumInvoicedInDateRange } from '../data/billing.repository';
import { sumOrganizationRecognizedCostsInDateRange } from '../data/expenses.repository';
import { getOrganizationProjectRollup } from './get-organization-project-rollup';
import { aggregateOrgCost } from '../domain/aggregate-org-report';

export interface FinancialsOverviewPeriod {
  readonly fromDate: BusinessDate;
  readonly toDate: BusinessDate;
}

export interface FinancialsOverviewKpi {
  readonly value: MoneyValue | null;
  readonly href: string;
}

export interface FinancialsOverviewData {
  readonly currency: string;
  readonly today: BusinessDate;
  readonly period: FinancialsOverviewPeriod;
  readonly canReadCosts: boolean;
  readonly canReadAp: boolean;
  readonly canReadBilling: boolean;
  readonly costs: {
    readonly recognizedActual: FinancialsOverviewKpi;
    readonly cashPaid: FinancialsOverviewKpi;
    readonly openPayables: FinancialsOverviewKpi;
    readonly commitments: FinancialsOverviewKpi;
    readonly upcomingDue: FinancialsOverviewKpi;
  };
  readonly revenue: {
    readonly billed: FinancialsOverviewKpi;
    readonly collected: FinancialsOverviewKpi;
    readonly openReceivables: FinancialsOverviewKpi;
    readonly overdueAr: FinancialsOverviewKpi;
  };
}

function resolvePeriod(
  today: BusinessDate,
  fromDate?: string | null,
  toDate?: string | null,
): FinancialsOverviewPeriod {
  const from = businessDate(
    fromDate && isBusinessDate(fromDate) ? fromDate : `${today.slice(0, 7)}-01`,
  );
  const to = toDate && isBusinessDate(toDate) ? businessDate(toDate) : today;
  if (from > to) {
    return { fromDate: to, toDate: from };
  }
  return { fromDate: from, toDate: to };
}

export async function getFinancialsOverview(
  context: OrgContext,
  options: { readonly fromDate?: string | null; readonly toDate?: string | null } = {},
): Promise<FinancialsOverviewData> {
  const currency = context.organization.baseCurrency.toUpperCase();
  const today = todayInTimeZone(context.organization.timezone);
  const period = resolvePeriod(today, options.fromDate, options.toDate);
  const horizon = addDays(today, 30);

  const canReadCosts = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);

  const qs = `fromDate=${period.fromDate}&toDate=${period.toDate}`;

  const [
    recognizedActual,
    apCashPaid,
    advanceCashPaid,
    apPayables,
    rollup,
    billed,
    collected,
    billingRecords,
  ] = await Promise.all([
    canReadCosts
      ? sumOrganizationRecognizedCostsInDateRange(
          context.db,
          context.organizationId,
          currency,
          period.fromDate,
          period.toDate,
        )
      : Promise.resolve(null),
    canReadAp
      ? sumApPaymentsMadeInDateRange(
          context.db,
          context.organizationId,
          currency,
          period.fromDate,
          period.toDate,
        )
      : Promise.resolve(null),
    canReadAp
      ? sumPaidSubcontractAdvancesInDateRange(
          context.db,
          context.organizationId,
          currency,
          period.fromDate,
          period.toDate,
        )
      : Promise.resolve(null),
    canReadAp ? getOrganizationApPayables(context, { currency }) : Promise.resolve(null),
    canReadCosts ? getOrganizationProjectRollup(context) : Promise.resolve(null),
    canReadBilling
      ? sumInvoicedInDateRange(
          context.db,
          context.organizationId,
          currency,
          period.fromDate,
          period.toDate,
        )
      : Promise.resolve(null),
    canReadBilling
      ? sumCollectionsInDateRange(
          context.db,
          context.organizationId,
          currency,
          period.fromDate,
          period.toDate,
        )
      : Promise.resolve(null),
    canReadBilling ? listBillingRecords(context) : Promise.resolve(null),
  ]);

  let cashPaid: MoneyValue | null = null;
  if (apCashPaid != null) {
    const ap = fromNumericString(apCashPaid, currency) ?? zeroMoney(currency);
    const advances = fromNumericString(advanceCashPaid ?? '0', currency) ?? zeroMoney(currency);
    cashPaid = addMoney(ap, advances);
  }

  let upcomingDue: MoneyValue | null = null;
  if (apPayables) {
    upcomingDue = zeroMoney(currency);
    for (const bill of apPayables.bills) {
      if (bill.currency.toUpperCase() !== currency) continue;
      if (!bill.dueDate) continue;
      if (bill.dueDate < today || bill.dueDate > horizon) continue;
      upcomingDue = addMoney(upcomingDue, money(bill.outstanding, bill.currency));
    }
  }

  const commitments =
    rollup != null ? (aggregateOrgCost(rollup.rows, currency).committed?.value ?? null) : null;

  const receivables =
    billingRecords != null ? computeReceivablesSummary(billingRecords, currency, today) : null;

  return {
    currency,
    today,
    period,
    canReadCosts,
    canReadAp,
    canReadBilling,
    costs: {
      recognizedActual: {
        value: recognizedActual,
        href: `/expenses?dateFrom=${period.fromDate}&dateTo=${period.toDate}`,
      },
      cashPaid: {
        value: cashPaid,
        href: `/procurement/ap?${qs}`,
      },
      openPayables: {
        value: apPayables ? money(apPayables.outstanding, apPayables.currency) : null,
        href: '/procurement/ap',
      },
      commitments: {
        value: commitments,
        href: '/procurement',
      },
      upcomingDue: {
        value: upcomingDue,
        href: '/procurement/ap',
      },
    },
    revenue: {
      billed: {
        value: billed,
        href: `/billing?${qs}`,
      },
      collected: {
        value: collected,
        href: `/billing?${qs}`,
      },
      openReceivables: {
        value: receivables?.totalOutstanding ?? null,
        href: '/billing?filter=outstanding',
      },
      overdueAr: {
        value: receivables?.overdueTotal ?? null,
        href: '/billing?filter=overdue',
      },
    },
  };
}
