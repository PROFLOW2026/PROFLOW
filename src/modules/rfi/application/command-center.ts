import { and, eq, inArray } from 'drizzle-orm';
import { projects, vendors } from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';
import { formatRfiNumber } from '../domain/lifecycle';
import { listOverdueRfis } from './queries';

async function namesById(
  context: OrgContext,
  table: 'vendor' | 'project',
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  if (table === 'vendor') {
    const rows = await context.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.organizationId, context.organizationId), inArray(vendors.id, unique)));
    return new Map(rows.map((row) => [row.id, row.name]));
  }
  const rows = await context.db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, context.organizationId), inArray(projects.id, unique)));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Open RFIs whose due date is before today. */
export async function queryRfisOverdue(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const items = await listOverdueRfis(context.db, {
    organizationId: context.organizationId,
    today: input.today,
    projectIds: input.projectIds,
    limit: input.limit,
  });
  const [vendorNames, projectNames] = await Promise.all([
    namesById(
      context,
      'vendor',
      items.flatMap((item) => (item.vendorId ? [item.vendorId] : [])),
    ),
    namesById(
      context,
      'project',
      items.map((item) => item.projectId),
    ),
  ]);
  return items.slice(0, input.limit).map((item) => ({
    id: item.rfiId,
    projectId: item.projectId,
    projectName: projectNames.get(item.projectId) ?? null,
    vendorName: item.vendorId ? (vendorNames.get(item.vendorId) ?? null) : null,
    reference: `${formatRfiNumber(item.number)} ${item.subject}`.trim(),
    dueDate: item.dueDate,
  }));
}
