import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadProjectBillingRows } from '../data/billing.repository';
import { loadMonthCloseEconomicForProject } from '../data/month-close-economic.repository';
import { assertProjectInOrg, findProjectForecastInputs } from '../data/projects.repository';
import type { BillingPosition } from '../domain/types';
import { composeProjectFinancials } from './compose-project-financials';

/**
 * Billing-tab totals from the one compose engine (invoiced / paid / outstanding
 * including held retainage and surviving month-close revenue corrections).
 */
export async function getComposedProjectBillingPosition(
  context: OrgContext,
  projectId: string,
): Promise<BillingPosition> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const exists = await assertProjectInOrg(context.db, context.organizationId, projectId);
  if (!exists) throw new NotFoundError('Project');

  const forecastInputs = await findProjectForecastInputs(
    context.db,
    context.organizationId,
    projectId,
    context.organization.baseCurrency,
  );
  const currency = forecastInputs.currency;

  const billingRows = await loadProjectBillingRows(
    context.db,
    context.organizationId,
    projectId,
  );
  const monthCloseEconomic = await loadMonthCloseEconomicForProject(
    context.db,
    context.organizationId,
    projectId,
    currency,
  );

  const composed = composeProjectFinancials({
    projectId,
    currency,
    expectedRemainingCostAmount: null,
    canReadCommercial: false,
    canReadBilling: true,
    canReadProfit: false,
    commercialData: null,
    billingRows,
    expenseContributions: [],
    laborInput: null,
    committed: null,
    openAp: null,
    recognizedVendor: null,
    monthCloseEconomic,
  });

  return composed.billing;
}
