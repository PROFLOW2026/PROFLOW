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
    canReadExpenses
      ? loadProjectExpenseContributions(context.db, context.organizationId, projectId)
      : Promise.resolve([]),
    canReadWorkforce
      ? getProjectLaborCost(context, projectId)
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
    canReadAp
      ? loadRecognizedVendorBillsForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        )
      : Promise.resolve(null),
  ]);

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
  });
}
