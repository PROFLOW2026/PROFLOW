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
import { fromNumericString, zeroMoney } from '@/shared/money';
import { hasPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { composeVendorCostRecognition } from '@/modules/ap';
import { excludeCommittedFromActualCost } from '@/modules/procurement';
import { buildFinancialCoverage, defaultCostSourcePresence, mergeCoveragePartials } from '../domain/coverage';
import {
  aggregateProjectCosts,
  emptyCostPosition,
  withCommittedAndApPayable,
  withRecognizedVendorBills,
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
  loadRecognizedVendorBillsForProject,
  sumOpenApPayableForProject,
  sumOpenCommittedCostsForProject,
} from '../data/committed-costs.repository';
import { loadProjectExpenseContributions } from '../data/expenses.repository';
import {
  assertProjectInOrg,
  findProjectForecastInputs,
} from '../data/projects.repository';

export async function getProjectFinancials(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancials> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const exists = await assertProjectInOrg(context.db, context.organizationId, projectId);
  if (!exists) throw new NotFoundError('Project');

  const forecastInputs = await findProjectForecastInputs(
    context.db,
    context.organizationId,
    projectId,
    context.organization.baseCurrency,
  );
  const currency = forecastInputs.currency;

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
    recognizedVendorResult,
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
    // Posted vendor bills recognize Actual — requires AP read (not expenses alone).
    canReadAp
      ? loadRecognizedVendorBillsForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        )
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

  // Exclude expenses linked to recognized bills so bill + expense never double-count.
  const linkedExpenseIds = recognizedVendorResult?.linkedExpenseIds ?? new Set<string>();
  const expensesForActual =
    linkedExpenseIds.size === 0
      ? expenseContributions
      : expenseContributions.filter(
          (line) => !line.expenseId || !linkedExpenseIds.has(line.expenseId),
        );

  const hasRecognizedBills = (recognizedVendorResult?.billCount ?? 0) > 0;
  const aggregated =
    expensesForActual.length > 0 || laborInput?.hasWorkforceData || hasRecognizedBills
      ? aggregateProjectCosts(expensesForActual, laborInput, currency)
      : { cost: emptyCostPosition(currency), sources: defaultCostSourcePresence(), partials: [] };

  let { cost } = aggregated;
  const { sources, partials } = aggregated;
  const commitmentPartials: CoveragePartial[] = [];

  if (recognizedVendorResult) {
    const recognition = composeVendorCostRecognition({
      currency,
      recognizedBillAmounts: recognizedVendorResult.billAmounts,
      linkedExpenseAmounts: [], // expenses already excluded upstream
    });
    cost = withRecognizedVendorBills(cost, recognition.netRecognizedVendorActual);
    if (recognizedVendorResult.excludedForeignCurrencyCount > 0) {
      commitmentPartials.push({
        reason: 'foreign_currency_ap_excluded',
        count: recognizedVendorResult.excludedForeignCurrencyCount,
      });
    }
  }

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

  const expectedRemainingCost =
    fromNumericString(forecastInputs.expectedRemainingCostAmount, currency) ??
    zeroMoney(currency);

  // Hard separation: committed is reported beside actual, never folded into Actual.
  excludeCommittedFromActualCost({
    actualExpenseTotal: cost.actualCostToDate.amount,
    committedOpenTotal: committedOpen.amount,
    currency,
  });
  // Forecast Final Cost = Actual (expenses + recognized bills) + Remaining Commitments + ETC.
  // Open AP payable / vendor payments stay cash-only.
  cost = withCommittedAndApPayable(cost, committedOpen, openApPayable, expectedRemainingCost);
  const coverage: FinancialCoverage = buildFinancialCoverage(
    sources,
    new Date(),
    mergeCoveragePartials(partials, billingPartials, commitmentPartials),
  );

  const profit =
    canReadProfit && commercial
      ? roundProfitPosition(
          computeProfitPosition(
            commercial.currentContractValue,
            cost.estimatedFinalCost,
            cost.actualCostToDate,
          ),
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
