import type { ProjectFinancials } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadProjectBillingRows } from '../data/billing.repository';
import { loadProjectCommercialData } from '../data/commercial.repository';
import { loadProjectExpenseContributions } from '../data/expenses.repository';
import { assertProjectInOrg, findProjectForecastInputs } from '../data/projects.repository';
import { composeProjectFinancials } from './compose-project-financials';

/**
 * Overview snapshot — same compose truth as full financials but skips labor, AP,
 * procurement committed, vendor bills, and month-close passes that the overview
 * KPI card does not surface on first paint.
 */
export async function getProjectFinancialsOverviewSnapshot(
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
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);

  const commercialData = canReadCommercial
    ? await loadProjectCommercialData(context.db, context.organizationId, projectId)
    : null;
  const billingRows = canReadBilling
    ? await loadProjectBillingRows(context.db, context.organizationId, projectId)
    : null;
  const expenseContributions = canReadExpenses
    ? await loadProjectExpenseContributions(context.db, context.organizationId, projectId)
    : [];

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
    laborInput: null,
    committed: null,
    openAp: null,
    recognizedVendor: null,
    monthCloseEconomic: undefined,
  });
}
