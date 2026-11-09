import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { insertProjectRiskRow } from '../data/project-risks.repository';
import type { CreateProjectRiskInput, ProjectRiskRecord } from '../domain/types';
import { parseCreateProjectRisk } from '../validation/schemas';
import { requireProjectInOrganization } from './shared';

export async function createProjectRisk(
  context: OrgContext,
  input: CreateProjectRiskInput,
): Promise<ProjectRiskRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const parsed = parseCreateProjectRisk(input);
  await requireProjectInOrganization(context, parsed.projectId);
  return insertProjectRiskRow(context.db, {
    organizationId: context.organizationId,
    projectId: parsed.projectId,
    description: parsed.description,
    probability: parsed.probability,
    impact: parsed.impact,
    ownerUserId: context.userId,
    treatment: parsed.treatment,
    status: parsed.status,
    reviewOn: parsed.reviewOn,
  });
}
