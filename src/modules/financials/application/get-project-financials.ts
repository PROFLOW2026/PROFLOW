import type { ProjectFinancials } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import {
  loadProjectBillingRows,
} from '../data/billing.repository';
import { loadProjectCommercialData } from '../data/commercial.repository';
import {
  loadRecognizedVendorBillsForProject,
  sumOpenApPayableForProject,
  sumOpenCommittedCostsForProject,
} from '../data/committed-costs.repository';
import { loadProjectExpenseContributions } from '../data/expenses.repository';
import { loadMonthCloseEconomicForProject } from '../data/month-close-economic.repository';
import {
  assertProjectInOrg,
  findProjectForecastInputs,
} from '../data/projects.repository';
import { composeProjectFinancials } from './compose-project-financials';

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

  // Sequential on purpose: this runs inside a single-connection transaction
  // (PGlite in tests, one pooled client in production). Promise.all deadlocks.
  const commercialData = canReadCommercial
    ? await loadProjectCommercialData(context.db, context.organizationId, projectId)
    : null;
  const billingRows = canReadBilling
    ? await loadProjectBillingRows(context.db, context.organizationId, projectId)
    : null;
  const expenseContributions = canReadExpenses
    ? await loadProjectExpenseContributions(context.db, context.organizationId, projectId)
    : [];
  const laborResult = canReadWorkforce
    ? await getProjectLaborCost(context, projectId)
        .then(
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
        )
        .catch((error: unknown) => {
          if (error instanceof NotFoundError) {
            return { ok: false as const, laborInput: null };
          }
          throw error;
        })
    : { ok: false as const, laborInput: null };
  const committedResult = canReadProcurement
    ? await sumOpenCommittedCostsForProject(
        context.db,
        context.organizationId,
        projectId,
        currency,
      )
    : null;
  const apResult = canReadAp
    ? await sumOpenApPayableForProject(context.db, context.organizationId, projectId, currency)
    : null;
  const recognizedVendorResult = canReadAp
    ? await loadRecognizedVendorBillsForProject(
        context.db,
        context.organizationId,
        projectId,
        currency,
      )
    : null;
  const monthCloseEconomic = await loadMonthCloseEconomicForProject(
    context.db,
    context.organizationId,
    projectId,
    currency,
  );

  return composeProjectFinancials({
    projectId,
    currency,
    expectedRemainingCostAmount: forecastInputs.expectedRemainingCostAmount,
    workKind: forecastInputs.workKind,
    pricingMode: forecastInputs.pricingMode,
    canReadCommercial,
    canReadBilling,
    canReadProfit,
    commercialData,
    billingRows,
    expenseContributions,
    laborInput: laborResult.laborInput,
    committed: committedResult,
    openAp: apResult,
    recognizedVendor: recognizedVendorResult,
    monthCloseEconomic,
  });
}
