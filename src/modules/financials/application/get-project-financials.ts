import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import type {
  BillingPosition,
  CommercialPosition,
  CoveragePartial,
  FinancialCoverage,
  ProjectFinancials,
} from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { zeroMoney } from '@/shared/money';
import { hasPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { buildFinancialCoverage, defaultCostSourcePresence, mergeCoveragePartials } from '../domain/coverage';
import { aggregateProjectCosts, emptyCostPosition } from '../domain/cost-aggregation';
import { computeProfitPosition, roundProfitPosition } from '../domain/profit';
import {
  computeBillingPositionFromRows,
  loadProjectBillingRows,
} from '../data/billing.repository';
import {
  emptyCommercialPosition,
  loadProjectCommercialData,
} from '../data/commercial.repository';
import { loadProjectExpenseContributions } from '../data/expenses.repository';
import { assertProjectInOrg, findProjectCurrency } from '../data/projects.repository';

export async function getProjectFinancials(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancials> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const exists = await assertProjectInOrg(context.db, context.organizationId, projectId);
  if (!exists) throw new NotFoundError('Project');

  const currency = await findProjectCurrency(
    context.db,
    context.organizationId,
    projectId,
    context.organization.baseCurrency,
  );

  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);

  const commercialData = canReadCommercial
    ? await loadProjectCommercialData(context.db, context.organizationId, projectId)
    : null;

  const commercial: CommercialPosition | null = canReadCommercial
    ? (commercialData?.position ?? emptyCommercialPosition(currency))
    : null;

  let billing: BillingPosition = {
    invoiced: zeroMoney(currency),
    paid: zeroMoney(currency),
    outstanding: zeroMoney(currency),
  };

  let billingPartials: CoveragePartial[] = [];

  if (canReadBilling) {
    const billingRows = await loadProjectBillingRows(context.db, context.organizationId, projectId);
    const position = computeBillingPositionFromRows(billingRows, currency);
    billing = {
      invoiced: position.invoiced,
      paid: position.paid,
      outstanding: position.outstanding,
    };
    if (position.excludedForeignCurrencyRecordCount > 0) {
      billingPartials = [
        {
          reason: 'foreign_currency_billing_excluded',
          count: position.excludedForeignCurrencyRecordCount,
        },
      ];
    }
  }

  const expenseContributions = await loadProjectExpenseContributions(
    context.db,
    context.organizationId,
    projectId,
  );

  let laborInput: {
    laborCost: ReturnType<typeof zeroMoney>;
    hasWorkforceData: boolean;
    entriesMissingCost?: number;
    excludedForeignCurrencyEntries?: number;
  } | null = null;

  if (hasPermission(context, PERMISSIONS.WORKFORCE_READ)) {
    try {
      const labor = await getProjectLaborCost(context, projectId);
      laborInput = {
        laborCost: labor.laborCost,
        hasWorkforceData: labor.hasWorkforceData,
        entriesMissingCost: labor.entriesMissingCost,
        excludedForeignCurrencyEntries: labor.excludedForeignCurrencyEntries,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        laborInput = null;
      } else {
        throw error;
      }
    }
  }

  const aggregated =
    expenseContributions.length > 0 || laborInput?.hasWorkforceData
      ? aggregateProjectCosts(expenseContributions, laborInput, currency)
      : { cost: emptyCostPosition(currency), sources: defaultCostSourcePresence(), partials: [] };

  const { cost, sources, partials } = aggregated;

  const coverage: FinancialCoverage = buildFinancialCoverage(
    sources,
    new Date(),
    mergeCoveragePartials(partials, billingPartials),
  );

  const profit =
    canReadProfit && commercial
      ? roundProfitPosition(
          computeProfitPosition(commercial.currentContractValue, cost.estimatedFinalCost),
        )
      : {
          estimatedProfit: zeroMoney(currency),
          marginPercent: null,
        };

  return {
    projectId,
    currency: commercialData?.currency ?? currency,
    commercial,
    billing,
    cost,
    profit,
    coverage,
  };
}