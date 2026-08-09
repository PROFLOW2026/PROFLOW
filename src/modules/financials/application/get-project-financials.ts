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
import { excludeCommittedFromActualCost } from '@/modules/procurement';
import { buildFinancialCoverage, defaultCostSourcePresence, mergeCoveragePartials } from '../domain/coverage';
import {
  aggregateProjectCosts,
  emptyCostPosition,
  withCommittedAndApPayable,
} from '../domain/cost-aggregation';
import { computeProfitPosition, roundProfitPosition } from '../domain/profit';
import {
  computeBillingPositionFromRows,
  loadProjectBillingRows,
} from '../data/billing.repository';
import {
  emptyCommercialPosition,
  loadProjectCommercialData,
} from '../data/commercial.repository';
import {
  sumOpenApPayableForProject,
  sumOpenCommittedCostsForProject,
} from '../data/committed-costs.repository';
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
  const canReadProcurement = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  // Independent permission-gated loads — same aggregation order as before.
  const [
    commercialData,
    billingRows,
    expenseContributions,
    laborResult,
    committedResult,
    apResult,
  ] = await Promise.all([
    canReadCommercial
      ? loadProjectCommercialData(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    canReadBilling
      ? loadProjectBillingRows(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    // Expense rollups require expenses:read — project_financials:read alone must not bypass.
    canReadExpenses
      ? loadProjectExpenseContributions(context.db, context.organizationId, projectId)
      : Promise.resolve([]),
    canReadWorkforce
      ? getProjectLaborCost(context, projectId).then(
          (labor) =>
            ({
              ok: true as const,
              laborInput: {
                laborCost: labor.laborCost,
                hasWorkforceData: labor.hasWorkforceData,
                entriesMissingCost: labor.entriesMissingCost,
                excludedForeignCurrencyEntries: labor.excludedForeignCurrencyEntries,
              },
            }) as const,
        ).catch((error: unknown) => {
          if (error instanceof NotFoundError) {
            return { ok: false as const, laborInput: null };
          }
          throw error;
        })
      : Promise.resolve({ ok: false as const, laborInput: null }),
    canReadProcurement
      ? sumOpenCommittedCostsForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        )
      : Promise.resolve(null),
    canReadAp
      ? sumOpenApPayableForProject(context.db, context.organizationId, projectId, currency)
      : Promise.resolve(null),
  ]);

  const commercial: CommercialPosition | null = canReadCommercial
    ? (commercialData?.position ?? emptyCommercialPosition(currency))
    : null;

  let billing: BillingPosition = {
    invoiced: zeroMoney(currency),
    paid: zeroMoney(currency),
    outstanding: zeroMoney(currency),
  };

  let billingPartials: CoveragePartial[] = [];

  if (canReadBilling && billingRows) {
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

  const laborInput = laborResult.laborInput;

  const aggregated =
    expenseContributions.length > 0 || laborInput?.hasWorkforceData
      ? aggregateProjectCosts(expenseContributions, laborInput, currency)
      : { cost: emptyCostPosition(currency), sources: defaultCostSourcePresence(), partials: [] };

  let { cost } = aggregated;
  const { sources, partials } = aggregated;
  const commitmentPartials: CoveragePartial[] = [];

  let committedOpen = zeroMoney(currency);
  if (committedResult) {
    committedOpen = committedResult.total;
    if (committedResult.excludedForeignCurrencyCount > 0) {
      commitmentPartials.push({
        reason: 'foreign_currency_committed_excluded',
        count: committedResult.excludedForeignCurrencyCount,
      });
    }
  }

  let openApPayable = zeroMoney(currency);
  if (apResult) {
    openApPayable = apResult.total;
    if (apResult.excludedForeignCurrencyCount > 0) {
      commitmentPartials.push({
        reason: 'foreign_currency_ap_excluded',
        count: apResult.excludedForeignCurrencyCount,
      });
    }
  }

  // Hard separation: committed is reported beside actual, never folded in.
  excludeCommittedFromActualCost({
    actualExpenseTotal: cost.actualCostToDate.amount,
    committedOpenTotal: committedOpen.amount,
    currency,
  });
  cost = withCommittedAndApPayable(cost, committedOpen, openApPayable);

  const coverage: FinancialCoverage = buildFinancialCoverage(
    sources,
    new Date(),
    mergeCoveragePartials(partials, billingPartials, commitmentPartials),
  );

  const profit =
    canReadProfit && commercial
      ? roundProfitPosition(
          computeProfitPosition(commercial.currentContractValue, cost.estimatedFinalCost),
        )
      : null;

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
