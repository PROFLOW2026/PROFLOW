import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listProjectRiskRows } from '../data/project-risks.repository';
import type { ProjectRiskRecord } from '../domain/types';
import { requireProjectInOrganization } from './shared';

export async function listProjectRisks(
  context: OrgContext,
  projectId: string,
): Promise<readonly ProjectRiskRecord[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  await requireProjectInOrganization(context, projectId);
  return listProjectRiskRows(context.db, context.organizationId, projectId);
}
