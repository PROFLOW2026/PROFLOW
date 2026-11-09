import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { updateProjectRiskStatusRow } from '../data/project-risks.repository';
import type { ProjectRiskRecord, UpdateProjectRiskStatusInput } from '../domain/types';
import { parseUpdateProjectRiskStatus } from '../validation/schemas';
import { requireProjectInOrganization } from './shared';

export async function updateProjectRiskStatus(
  context: OrgContext,
  input: UpdateProjectRiskStatusInput,
): Promise<ProjectRiskRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const parsed = parseUpdateProjectRiskStatus(input);
  await requireProjectInOrganization(context, parsed.projectId);
  const updated = await updateProjectRiskStatusRow(
    context.db,
    context.organizationId,
    parsed.projectId,
    parsed.riskId,
    parsed.status,
  );
  if (!updated) throw new NotFoundError('project_risk');
  return updated;
}
