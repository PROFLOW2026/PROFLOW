import { and, asc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { projects, siteInstructions, vendors } from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';

/** Issued site instructions still waiting for acknowledgement after their due date. */
export async function queryInstructionAcknowledgementOverdue(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const rows = await context.db
    .select({
      id: siteInstructions.id,
      projectId: siteInstructions.projectId,
      projectName: projects.name,
      vendorName: vendors.name,
      title: siteInstructions.title,
      instructionNumber: siteInstructions.instructionNumber,
      dueDate: siteInstructions.dueDate,
      issuedAt: siteInstructions.issuedAt,
    })
    .from(siteInstructions)
    .innerJoin(
      projects,
      and(eq(projects.id, siteInstructions.projectId), eq(projects.organizationId, siteInstructions.organizationId)),
    )
    .innerJoin(
      vendors,
      and(eq(vendors.id, siteInstructions.vendorId), eq(vendors.organizationId, siteInstructions.organizationId)),
    )
    .where(
      and(
        eq(siteInstructions.organizationId, context.organizationId),
        inArray(siteInstructions.projectId, [...input.projectIds]),
        eq(siteInstructions.status, 'issued'),
        isNotNull(siteInstructions.dueDate),
        lt(siteInstructions.dueDate, input.today),
      ),
    )
    .orderBy(asc(siteInstructions.dueDate), asc(siteInstructions.instructionNumber))
    .limit(input.limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    vendorName: row.vendorName,
    reference: `${row.instructionNumber} · ${row.title}`,
    dueDate: row.dueDate,
    since: row.issuedAt,
    kind: 'instruction' as const,
  }));
}
