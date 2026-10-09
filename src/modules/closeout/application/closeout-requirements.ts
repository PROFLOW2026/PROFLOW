import { projectCloseoutRequirementsSettingKey } from '@/modules/projects/application/apply-template-metadata';
import { getOrganizationSettingValue } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';

export async function getProjectCloseoutRequirementKeys(
  context: OrgContext,
  projectId: string,
): Promise<readonly string[]> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    projectCloseoutRequirementsSettingKey(projectId),
  );
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}
