import { and, eq, inArray } from 'drizzle-orm';
import { projects, vendors } from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';
import { formatSubmittalNumber } from '../domain/lifecycle';
import { listPendingSubmittals } from './queries';

/** Submittals sitting in review (submitted / under review). */
export async function querySubmittalsPending(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const items = await listPendingSubmittals(context.db, {
    organizationId: context.organizationId,
    today: input.today,
    projectIds: input.projectIds,
    limit: input.limit,
  });
  const selected = items.slice(0, input.limit);
  const vendorIds = [...new Set(selected.map((item) => item.vendorId))];
  const projectIds = [...new Set(selected.map((item) => item.projectId))];
  const [vendorRows, projectRows] = await Promise.all([
    vendorIds.length === 0
      ? Promise.resolve([])
      : context.db
          .select({ id: vendors.id, name: vendors.name })
          .from(vendors)
          .where(and(eq(vendors.organizationId, context.organizationId), inArray(vendors.id, vendorIds))),
    projectIds.length === 0
      ? Promise.resolve([])
      : context.db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.organizationId, context.organizationId), inArray(projects.id, projectIds))),
  ]);
  const vendorName = new Map(vendorRows.map((row) => [row.id, row.name]));
  const projectName = new Map(projectRows.map((row) => [row.id, row.name]));
  return selected.map((item) => ({
    id: item.submittalId,
    projectId: item.projectId,
    projectName: projectName.get(item.projectId) ?? null,
    vendorName: vendorName.get(item.vendorId) ?? null,
    reference: `${formatSubmittalNumber(item.number)} ${item.title}`.trim(),
    dueDate: item.dueDate,
    since: item.submittedAt,
  }));
}
