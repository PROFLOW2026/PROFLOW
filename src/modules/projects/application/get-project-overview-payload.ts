import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import type { ContractValueEventRecord as CommercialValueEventRecord } from '@/modules/commercial/domain/types';
import {
  assembleProjectDetailChrome,
  type ProjectDetailChrome,
} from '@/modules/projects/application/get-project-detail';
import { mapProjectRow, mapContractRow } from '@/modules/projects';
import type { ContractValueEventRecord } from '@/modules/projects/domain/types';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import { loadProjectCommercialBundle } from '@/modules/financials';
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
  events: readonly CommercialValueEventRecord[],
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
 * Compact overview read path: contract chrome + full financial truth (R-001).
 * Financial snapshot uses the same compose path as the Financials tab — no partial Actual.
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

  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);

  const [commercialBundle, financials] = await Promise.all([
    canReadCommercial
      ? loadProjectCommercialBundle(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    canReadFinancials ? getProjectFinancials(context, projectId) : Promise.resolve(null),
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

  return { detail, financials, canReadProfit };
}
