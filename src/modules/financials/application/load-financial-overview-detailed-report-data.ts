import 'server-only';

import { getOrganizationApPayables } from '@/modules/ap';
import { listBillingRecords, computeReceivablesSummary } from '@/modules/billing';
import { listPaymentApplications } from '@/modules/billing';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, isBusinessDate, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgApPayablesSummary } from '@/modules/ap/application/payables';
import { getOrganizationProjectRollup, type OrganizationProjectRollup } from './get-organization-project-rollup';
import { getCashPaidBreakdown, type CashPaidBreakdownData } from './get-cash-paid-breakdown';
import { getRecognizedCostBreakdown, type RecognizedCostBreakdownData } from './get-recognized-cost-breakdown';

const PAGE = 200;

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

async function listAllBillingInRange(
  context: OrgContext,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<BillingRecordSummary[]> {
  const all: BillingRecordSummary[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await listBillingRecords(context, {
      filter: 'all',
      fromDate,
      toDate,
      limit: PAGE,
      offset,
    });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all.filter((row) => row.status !== 'void');
}

async function listAllBillingSnapshot(context: OrgContext): Promise<BillingRecordSummary[]> {
  const all: BillingRecordSummary[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await listBillingRecords(context, { filter: 'all', limit: PAGE, offset });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all.filter((row) => row.status !== 'void');
}

async function listAllPaymentApplicationsInRange(
  context: OrgContext,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<PaymentApplicationRow[]> {
  const all: PaymentApplicationRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const batch = await listPaymentApplications(context, {
      paymentFrom: fromDate,
      paymentTo: toDate,
      limit: PAGE,
      offset,
    });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all.filter((row) => row.status !== 'void');
}

export interface FinancialOverviewDetailedReportData {
  readonly period: { readonly fromDate: BusinessDate; readonly toDate: BusinessDate };
  readonly today: BusinessDate;
  readonly recognized: RecognizedCostBreakdownData | null;
  readonly cashPaid: CashPaidBreakdownData | null;
  readonly billingInPeriod: readonly BillingRecordSummary[];
  readonly collectionsInPeriod: readonly PaymentApplicationRow[];
  readonly billingSnapshot: readonly BillingRecordSummary[];
  readonly receivablesSnapshot: ReturnType<typeof computeReceivablesSummary> | null;
  readonly apPayables: OrgApPayablesSummary | null;
  readonly projectRollup: OrganizationProjectRollup | null;
}

export async function loadFinancialOverviewDetailedReportData(
  context: OrgContext,
  options: { readonly fromDate?: string | null; readonly toDate?: string | null } = {},
): Promise<FinancialOverviewDetailedReportData> {
  const today = todayInTimeZone(context.organization.timezone);
  const period = resolvePeriod(today, options.fromDate, options.toDate);

  const canReadCosts = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);

  const [recognized, cashPaid, billingInPeriod, collectionsInPeriod, billingSnapshot, apPayables, projectRollup] =
    await Promise.all([
      canReadCosts
        ? getRecognizedCostBreakdown(context, {
            fromDate: period.fromDate,
            toDate: period.toDate,
          })
        : Promise.resolve(null),
      canReadCosts || canReadAp
        ? getCashPaidBreakdown(context, {
            fromDate: period.fromDate,
            toDate: period.toDate,
          })
        : Promise.resolve(null),
      canReadBilling
        ? listAllBillingInRange(context, period.fromDate, period.toDate)
        : Promise.resolve([]),
      canReadBilling
        ? listAllPaymentApplicationsInRange(context, period.fromDate, period.toDate)
        : Promise.resolve([]),
      canReadBilling ? listAllBillingSnapshot(context) : Promise.resolve([]),
      canReadAp ? getOrganizationApPayables(context) : Promise.resolve(null),
      canReadCosts ? getOrganizationProjectRollup(context) : Promise.resolve(null),
    ]);

  const currency = context.organization.baseCurrency.toUpperCase();
  const receivablesSnapshot =
    billingSnapshot.length > 0 ? computeReceivablesSummary(billingSnapshot, currency, today) : null;

  return {
    period,
    today,
    recognized,
    cashPaid,
    billingInPeriod,
    collectionsInPeriod,
    billingSnapshot,
    receivablesSnapshot,
    apPayables,
    projectRollup,
  };
}
