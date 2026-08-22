import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listPaymentApplications } from '@/modules/billing/application/list-payment-applications';
import type { BillingPosition } from '@/modules/financials/domain/types';
import { composeProjectFinancials, loadMonthCloseEconomicForProject } from '@/modules/financials';
import {
  findProjectInOrganization,
  listBillingContractOptions,
  listUnbilledChangeOrders as listUnbilledChangeOrdersRepo,
} from '../data/billing.repository';
import { loadProjectBillingRecordsBundle } from './load-project-billing-records-bundle';
import type { BillingRecordSummary, UnbilledChangeOrder } from '../domain/types';

export type ProjectBillingTabPayload = {
  readonly position: BillingPosition;
  readonly records: BillingRecordSummary[];
  readonly unbilledChanges: UnbilledChangeOrder[];
  readonly canManage: boolean;
  readonly payments: Awaited<ReturnType<typeof listPaymentApplications>>;
  readonly contracts: Awaited<ReturnType<typeof listBillingContractOptions>>;
};

/**
 * Single billing-records read for position + list UI; parallel secondary fetches.
 */
export async function loadProjectBillingTabPayload(
  context: OrgContext,
  projectId: string,
  contractId?: string | null,
): Promise<ProjectBillingTabPayload> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const timezone = context.organization.timezone;

  const [billingBundle, monthCloseEconomic, unbilledChanges, payments, contracts] =
    await Promise.all([
      loadProjectBillingRecordsBundle(
        context.db,
        context.organizationId,
        projectId,
        timezone,
        contractId,
      ),
      loadMonthCloseEconomicForProject(
        context.db,
        context.organizationId,
        projectId,
        project.currency ?? context.organization.baseCurrency,
      ),
      listUnbilledChangeOrdersRepo(context.db, context.organizationId, projectId),
      listPaymentApplications(context, {
        projectId,
        limit: 25,
        includeVoided: true,
      }),
      listBillingContractOptions(context.db, context.organizationId, projectId),
    ]);

  const currency = (project.currency ?? context.organization.baseCurrency).toUpperCase();

  const composed = composeProjectFinancials({
    projectId,
    currency,
    expectedRemainingCostAmount: null,
    canReadCommercial: false,
    canReadBilling: true,
    canReadProfit: false,
    commercialData: null,
    billingRows: billingBundle.billingRows,
    expenseContributions: [],
    laborInput: null,
    committed: null,
    openAp: null,
    recognizedVendor: null,
    monthCloseEconomic,
  });

  return {
    position: composed.billing,
    records: billingBundle.records,
    unbilledChanges,
    canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
    payments,
    contracts,
  };
}
