/**
 * Owner business profitability view — composes existing dashboard/rollup engines only.
 * Does not introduce new financial formulas.
 */

import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { sumOrganizationCompanyOnlyExpenses } from '../data/expenses.repository';
import { sumOrganizationGeneralPoolTotals } from '../data/general-cost-months.repository';
import { getHomeDashboard } from './get-home-dashboard';

export interface BusinessProfitabilityKpi {
  readonly value: MoneyValue | null;
  readonly href: string;
}

export interface BusinessProfitabilityData {
  readonly currency: string;
  readonly canReadCommercial: boolean;
  readonly canReadBilling: boolean;
  readonly canReadProfit: boolean;
  readonly canReadAp: boolean;
  /** CCV — contractual revenue basis, not cash. */
  readonly currentContractValue: BusinessProfitabilityKpi;
  /** NET finalized billings — not revenue recognition in accounting sense. */
  readonly netBilled: BusinessProfitabilityKpi;
  /** Cash collected from clients — not revenue. */
  readonly netCollected: BusinessProfitabilityKpi;
  readonly netOutstandingAr: BusinessProfitabilityKpi;
  /** Sum of project direct actual costs. */
  readonly directProjectCost: BusinessProfitabilityKpi;
  readonly allocatedOverhead: BusinessProfitabilityKpi;
  readonly companyOnlyCost: BusinessProfitabilityKpi;
  readonly companyActual: BusinessProfitabilityKpi;
  readonly unallocatableGeneral: BusinessProfitabilityKpi;
  readonly openCommitments: BusinessProfitabilityKpi;
  readonly forecastFinalCost: BusinessProfitabilityKpi;
  readonly expectedRemainingCost: BusinessProfitabilityKpi;
  /** CCV − actual project cost (contractual current profit). */
  readonly contractualCurrentProfit: BusinessProfitabilityKpi;
  /** CCV − forecast final cost. */
  readonly forecastProfit: BusinessProfitabilityKpi;
  /** CCV − company actual (when general pool disclosed). */
  readonly companyProfit: BusinessProfitabilityKpi;
  readonly apOutstanding: BusinessProfitabilityKpi;
  readonly reconcilesCompanyActual: boolean | null;
}

function kpi(value: MoneyValue | null, href: string): BusinessProfitabilityKpi {
  return { value, href };
}

export async function getBusinessProfitability(context: OrgContext): Promise<BusinessProfitabilityData | null> {
  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);

  if (!canReadProfit && !canReadCommercial && !canReadBilling) {
    return null;
  }

  const currency = context.organization.baseCurrency.toUpperCase();
  const [dashboard, companyOnlyExpenses, generalPoolTotals] = await Promise.all([
    getHomeDashboard(context, { workKindFilter: 'all' }),
    canReadProfit
      ? sumOrganizationCompanyOnlyExpenses(context.db, context.organizationId, currency)
      : Promise.resolve(null),
    canReadProfit
      ? sumOrganizationGeneralPoolTotals(context.db, context.organizationId, currency)
      : Promise.resolve(null),
  ]);
  const forecast = dashboard.forecast;
  const unallocatableGeneral =
    generalPoolTotals != null
      ? (fromNumericString(generalPoolTotals.unallocatable, currency) ?? zeroMoney(currency))
      : null;

  return {
    currency,
    canReadCommercial,
    canReadBilling,
    canReadProfit,
    canReadAp,
    currentContractValue: kpi(dashboard.totalContractValue, '/reports?section=commercial'),
    netBilled: kpi(dashboard.billing?.netInvoiced ?? null, '/billing'),
    netCollected: kpi(dashboard.billing?.netPaid ?? null, '/billing?filter=paid'),
    netOutstandingAr: kpi(dashboard.billing?.netOutstanding ?? null, '/billing?filter=open'),
    directProjectCost: kpi(dashboard.totalActualCost, '/reports?section=cost'),
    allocatedOverhead: kpi(forecast?.totalAllocatedOverhead ?? null, '/overhead'),
    companyOnlyCost: kpi(companyOnlyExpenses, '/expenses?allocationIntent=company_only'),
    companyActual: kpi(forecast?.companyActual ?? null, '/reports?section=cost'),
    unallocatableGeneral: kpi(unallocatableGeneral, '/overhead'),
    openCommitments: kpi(forecast?.totalRemainingCommitments ?? null, '/procurement'),
    forecastFinalCost: kpi(forecast?.totalForecastFinalCost ?? null, '/reports?section=profitability'),
    expectedRemainingCost: kpi(forecast?.totalExpectedRemaining ?? null, '/projects'),
    contractualCurrentProfit: kpi(dashboard.actualProfitTotal, '/reports?section=profitability'),
    forecastProfit: kpi(forecast?.totalForecastMargin ?? null, '/reports?section=profitability'),
    companyProfit: kpi(forecast?.companyProfit ?? null, '/reports?section=profitability'),
    apOutstanding: kpi(dashboard.apOutstanding, '/procurement/ap?status=open'),
    reconcilesCompanyActual: forecast?.companyActual != null ? true : null,
  };
}
