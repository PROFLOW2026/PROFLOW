import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { loadProjectBillingRows } from '@/modules/financials/data/billing.repository';
import { loadProjectCommercialBundle } from '@/modules/financials/data/commercial.repository';
import { loadProjectExpenseContributions } from '@/modules/financials/data/expenses.repository';
import {
  assembleProjectDetailChrome,
  type ProjectDetailChrome,
} from '@/modules/projects/application/get-project-detail';
import { mapProjectRow } from '@/modules/projects/data/projects.repository';
import { mapContractRow } from '@/modules/projects/data/contracts.repository';
import type { ContractValueEventRecord } from '@/modules/projects/domain/types';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission, assertSameOrganization, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export type ProjectOverviewPayload = {
  readonly detail: ProjectDetailChrome;
  readonly financials: ProjectFinancials | null;
  readonly canReadProfit: boolean;
};

function mapOverviewValueEvents(
  events: readonly import('@/modules/commercial/domain/types').ContractValueEventRecord[],
): ContractValueEventRecord[] {
  return events.map((event) => ({
    id: event.id,
    organizationId: event.organizationId,
    contractId: event.contractId,
    projectId: event.projectId,
    kind: event.kind,
    amount: event.amount,
    currency: event.currency,
    changeOrderId: event.changeOrderId,
    effectiveDate: event.effectiveDate,
    reason: null,
    actorUserId: null,
    actorDisplayName: null,
    actorEmail: null,
    createdAt: new Date(0),
  }));
}

/**
 * Compact overview read path: one project lookup, then parallel commercial +
 * billing + expenses. Contract chrome and financial snapshot share one commercial
 * bundle instead of separate getProjectDetailChrome + getProjectFinancialsOverviewSnapshot chains.
 */
export async function getProjectOverviewPayload(
  context: OrgContext,
  projectId: string,
): Promise<ProjectOverviewPayload> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const [projectRow] = await context.db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)),
    )
    .limit(1);
  if (!projectRow || projectRow.archivedAt) throw new NotFoundError('Project');

  const project = mapProjectRow(projectRow);
  assertSameOrganization(context, project, 'Project');
  await assertCanAccessProject(context, projectId);

  const forecastInputs = {
    currency: (projectRow.currency ?? context.organization.baseCurrency).toUpperCase(),
    expectedRemainingCostAmount: projectRow.expectedRemainingCostAmount ?? null,
    workKind: projectRow.workKind ?? 'project',
    pricingMode: projectRow.pricingMode ?? null,
  };

  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);

  const [commercialBundle, billingRows, expenseContributions] = await Promise.all([
    canReadCommercial
      ? loadProjectCommercialBundle(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    canReadBilling
      ? loadProjectBillingRows(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    canReadExpenses
      ? loadProjectExpenseContributions(context.db, context.organizationId, projectId)
      : Promise.resolve([]),
  ]);

  const projectContracts = commercialBundle
    ? commercialBundle.contractRows.map(mapContractRow)
    : [];

  const detail = assembleProjectDetailChrome({
    project,
    projectContracts,
    allContractEvents: mapOverviewValueEvents(commercialBundle?.valueEvents ?? []),
    canReadContracts: canReadCommercial,
  });

  const financials = canReadFinancials
    ? composeProjectFinancials({
        projectId,
        currency: forecastInputs.currency,
        expectedRemainingCostAmount: forecastInputs.expectedRemainingCostAmount,
        workKind: forecastInputs.workKind,
        pricingMode: forecastInputs.pricingMode,
        canReadCommercial,
        canReadBilling,
        canReadProfit,
        commercialData: commercialBundle?.commercial ?? null,
        billingRows,
        expenseContributions,
        laborInput: null,
        committed: null,
        openAp: null,
        recognizedVendor: null,
        monthCloseEconomic: undefined,
      })
    : null;

  return { detail, financials, canReadProfit };
}
