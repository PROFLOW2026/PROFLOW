import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findProjectInOrganization,
  listBillingContractOptions,
  listBillingRecordsForProject,
  listProjectOptions,
  listUnbilledChangeOrders as listUnbilledChangeOrdersRepo,
} from '../data/billing.repository';
import type { BillingRecordSummary, UnbilledChangeOrder } from '../domain/types';

export async function listUnbilledChangeOrders(
  context: OrgContext,
  projectId: string,
): Promise<UnbilledChangeOrder[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  return listUnbilledChangeOrdersRepo(context.db, context.organizationId, projectId);
}

export async function listProjectBillingRecords(
  context: OrgContext,
  projectId: string,
  contractId?: string | null,
): Promise<BillingRecordSummary[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  return listBillingRecordsForProject(
    context.db,
    context.organizationId,
    projectId,
    context.organization.timezone,
    contractId,
  );
}

export async function listBillingProjectOptions(context: OrgContext) {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  return listProjectOptions(context.db, context.organizationId);
}

export async function listBillingContractOptionsForOrg(
  context: OrgContext,
  projectId?: string,
) {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  return listBillingContractOptions(context.db, context.organizationId, projectId);
}
