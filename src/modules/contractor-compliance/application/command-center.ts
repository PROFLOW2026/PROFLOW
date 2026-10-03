import { and, eq, inArray } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';
import { listExpiringComplianceForOrg } from './queries';

/** Required compliance items inside their warning window, or already expired. */
export async function queryComplianceExpiring(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const items = await listExpiringComplianceForOrg(context, {
    projectIds: [...input.projectIds],
    requiredOnly: true,
    today: input.today,
    limit: input.limit,
  });
  const projectIds = [...new Set(items.map((item) => item.projectId))];
  const projectRows =
    projectIds.length === 0
      ? []
      : await context.db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.organizationId, context.organizationId), inArray(projects.id, projectIds)));
  const projectName = new Map(projectRows.map((row) => [row.id, row.name]));
  return items.slice(0, input.limit).map((item) => ({
    id: item.documentId,
    projectId: item.projectId,
    projectName: projectName.get(item.projectId) ?? null,
    vendorName: item.vendorName || null,
    reference: item.title,
    dueDate: item.expiresOn,
    agreementId: item.agreementId,
  }));
}
