import { and, eq, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { loadProjectFinancialsBatch } from '@/modules/financials/application/load-project-financials-batch';
import {
  isIncompleteKpiAvailability,
  resolveOrgRollupKpiMoneyFields,
} from '@/modules/financials/domain/org-rollup-kpi-money';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  aggregateClientProfitability,
  type ClientProfitabilitySnapshot,
  type ClientProfitProjectInput,
} from '../domain/client-profitability';

/**
 * Client profitability from the same project compose path as org rollup.
 * Returns null when the viewer cannot read projects or project financials.
 */
export async function getClientProfitability(
  context: OrgContext,
  clientId: string,
): Promise<ClientProfitabilitySnapshot | null> {
  if (!hasPermission(context, PERMISSIONS.PROJECTS_READ)) return null;
  if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return null;

  const currency = context.organization.baseCurrency;
  const canProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);

  const projectRows = await context.db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      currency: projects.currency,
      expectedRemainingCostAmount: projects.expectedRemainingCostAmount,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, context.organizationId),
        eq(projects.clientId, clientId),
        isNull(projects.archivedAt),
      ),
    );

  if (projectRows.length === 0) {
    return aggregateClientProfitability([], currency);
  }

  const forecastByProject = new Map<
    string,
    {
      currency: string;
      expectedRemainingCostAmount: string | null;
      workKind: string | null;
      pricingMode: string | null;
    }
  >();
  const eligibleIds: string[] = [];
  const inputs: ClientProfitProjectInput[] = [];

  for (const row of projectRows) {
    const projectCurrency = (row.currency ?? currency).toUpperCase();
    if (projectCurrency !== currency.toUpperCase()) {
      inputs.push({
        projectId: row.id,
        name: row.name,
        status: row.status,
        currency: projectCurrency,
        excludedForeignCurrency: true,
        priceNotSet: false,
        withheldProfit: false,
        profitabilityMode: null,
        currentContract: null,
        netBilled: null,
        collected: null,
        openAr: null,
        directActual: null,
        allocatedOverhead: null,
        fullActual: null,
        actualProfit: null,
        marginPercent: null,
      });
      continue;
    }
    eligibleIds.push(row.id);
    forecastByProject.set(row.id, {
      currency: projectCurrency,
      expectedRemainingCostAmount: row.expectedRemainingCostAmount,
      workKind: row.workKind,
      pricingMode: row.pricingMode,
    });
  }

  const financialsByProject =
    eligibleIds.length === 0
      ? new Map()
      : await loadProjectFinancialsBatch(context, eligibleIds, forecastByProject);

  for (const projectId of eligibleIds) {
    const meta = projectRows.find((row) => row.id === projectId);
    if (!meta) continue;
    const financials = financialsByProject.get(projectId);
    if (!financials) {
      inputs.push({
        projectId,
        name: meta.name,
        status: meta.status,
        currency: currency.toUpperCase(),
        excludedForeignCurrency: false,
        priceNotSet: false,
        withheldProfit: true,
        profitabilityMode: null,
        currentContract: null,
        netBilled: null,
        collected: null,
        openAr: null,
        directActual: null,
        allocatedOverhead: null,
        fullActual: null,
        actualProfit: null,
        marginPercent: null,
      });
      continue;
    }

    const kpiMoney = resolveOrgRollupKpiMoneyFields({
      kpiAvailability: financials.kpiAvailability,
      canBilling,
      canProfit,
      priceNotSet: financials.priceNotSet,
      invoiced: financials.billing.netInvoiced,
      invoicedGross: financials.billing.invoiced,
      paid: financials.billing.netPaid,
      paidGross: financials.billing.paid,
      outstanding: financials.billing.netOutstanding,
      outstandingGross: financials.billing.outstanding,
      actualCost: financials.cost.actualCostToDate,
      laborActual: financials.cost.laborActual,
      vendorActual: financials.cost.vendorActual,
      overheadActual: financials.cost.overheadActual,
      committedOpen: financials.cost.committedOpen,
      openApPayable: financials.cost.openApPayable,
      expectedRemainingCost: financials.cost.expectedRemainingCost,
      estimatedFinalCost: financials.cost.estimatedFinalCost,
      assetCapitalActual: financials.cost.byFamily.assetCapital,
      estimatedProfit: financials.profit?.estimatedProfit ?? null,
      marginPercent: financials.profit?.marginPercent ?? null,
      actualProfit: financials.profit?.actualProfit ?? null,
      actualMarginPercent: financials.profit?.actualMarginPercent ?? null,
    });
    const actualIncomplete = isIncompleteKpiAvailability(financials.kpiAvailability?.actualCost);
    const currentContract =
      canCommercial && !financials.priceNotSet
        ? (financials.commercial?.currentContractValue ?? null)
        : null;

    inputs.push({
      projectId,
      name: meta.name,
      status: meta.status,
      currency: currency.toUpperCase(),
      excludedForeignCurrency: false,
      priceNotSet: financials.priceNotSet,
      withheldProfit: !financials.priceNotSet && kpiMoney.actualProfit == null,
      profitabilityMode: financials.projectProfitabilityMode ?? null,
      currentContract,
      netBilled: kpiMoney.invoiced,
      collected: kpiMoney.paid,
      openAr: kpiMoney.outstanding,
      directActual: actualIncomplete ? null : financials.cost.directActualCostToDate,
      allocatedOverhead: actualIncomplete ? null : financials.cost.allocatedGeneralBusinessCost,
      fullActual: actualIncomplete ? null : financials.cost.fullActualCostToDate,
      actualProfit: kpiMoney.actualProfit,
      marginPercent: kpiMoney.actualMarginPercent,
    });
  }

  return aggregateClientProfitability(inputs, currency);
}
