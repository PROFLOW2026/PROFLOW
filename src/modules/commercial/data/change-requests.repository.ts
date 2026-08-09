import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  changeRequestLines,
  changeRequests,
  projects,
  workPackages,
} from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ChangeRequestLineRecord,
  ChangeRequestListItem,
  ChangeRequestRecord,
  ChangeRequestStatus,
} from '../domain/types';

function mapChangeRequest(row: typeof changeRequests.$inferSelect): ChangeRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    contractId: row.contractId,
    reference: row.reference,
    title: row.title,
    description: row.description,
    status: row.status,
    direction: row.direction,
    requestedAmount: row.requestedAmount,
    currency: row.currency,
    requestedDate: row.requestedDate,
    sentAt: row.sentAt,
    decidedAt: row.decidedAt,
    cancelledAt: row.cancelledAt,
    createdByUserId: row.createdByUserId,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findChangeRequestById(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
): Promise<ChangeRequestRecord | null> {
  const [row] = await db
    .select()
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.id, changeRequestId),
        eq(changeRequests.organizationId, organizationId),
        isNull(changeRequests.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapChangeRequest(row) : null;
}

export async function listChangeRequestsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ChangeRequestRecord[]> {
  const rows = await db
    .select()
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.organizationId, organizationId),
        eq(changeRequests.projectId, projectId),
        isNull(changeRequests.archivedAt),
      ),
    )
    .orderBy(desc(changeRequests.createdAt));

  return rows.map(mapChangeRequest);
}

export async function listChangeRequestsAcrossProjects(
  db: DbExecutor,
  organizationId: string,
  options: {
    status?: ChangeRequestStatus | 'all';
    limit?: number;
    offset?: number;
  } = {},
): Promise<ChangeRequestListItem[]> {
  const conditions = [
    eq(changeRequests.organizationId, organizationId),
    isNull(changeRequests.archivedAt),
  ];

  if (options.status && options.status !== 'all') {
    conditions.push(eq(changeRequests.status, options.status));
  }

  const hardCap =
    options.limit != null && options.limit > ORG_LIST_HARD_CAP
      ? ORG_LIST_EXPORT_CAP
      : ORG_LIST_HARD_CAP;

  const rows = await db
    .select({
      changeRequest: changeRequests,
      projectName: projects.name,
      pricedAmount: sql<string | null>`(
        select qv.total_amount
        from quote_versions qv
        inner join quotes q on q.id = qv.quote_id
        where q.change_request_id = ${changeRequests.id}
          and qv.is_selected = true
        limit 1
      )`,
    })
    .from(changeRequests)
    .innerJoin(projects, eq(projects.id, changeRequests.projectId))
    .where(and(...conditions))
    .orderBy(desc(changeRequests.updatedAt))
    .limit(resolveListLimit(options.limit, { hardCap }))
    .offset(resolveListOffset(options.offset));

  return rows.map((row) => ({
    ...mapChangeRequest(row.changeRequest),
    projectName: row.projectName,
    pricedAmount: row.pricedAmount,
    workPackageNames: [],
  }));
}

export async function nextChangeRequestReference(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<string> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(changeRequests)
    .where(
      and(eq(changeRequests.organizationId, organizationId), eq(changeRequests.projectId, projectId)),
    );

  const next = (result?.count ?? 0) + 1;
  return `CR-${String(next).padStart(3, '0')}`;
}

export async function insertChangeRequest(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    contractId: string | null;
    reference: string;
    title: string;
    description?: string | null;
    direction: ChangeRequestRecord['direction'];
    requestedAmount?: string | null;
    currency: string;
    requestedDate?: string | null;
    createdByUserId: string;
    notes?: string | null;
  },
): Promise<ChangeRequestRecord> {
  const [row] = await db
    .insert(changeRequests)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      contractId: input.contractId,
      reference: input.reference,
      title: input.title,
      description: input.description ?? null,
      direction: input.direction,
      requestedAmount: input.requestedAmount ?? null,
      currency: input.currency,
      requestedDate: input.requestedDate ?? null,
      createdByUserId: input.createdByUserId,
      notes: input.notes ?? null,
      status: 'draft',
    })
    .returning();

  return mapChangeRequest(row!);
}

export async function updateChangeRequestFields(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    direction: ChangeRequestRecord['direction'];
    requestedAmount: string | null;
    requestedDate: string | null;
    notes: string | null;
    status: ChangeRequestStatus;
    sentAt: Date | null;
    decidedAt: Date | null;
    cancelledAt: Date | null;
    contractId: string | null;
  }>,
): Promise<ChangeRequestRecord | null> {
  const [row] = await db
    .update(changeRequests)
    .set(patch)
    .where(
      and(
        eq(changeRequests.id, changeRequestId),
        eq(changeRequests.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapChangeRequest(row) : null;
}

export async function listChangeRequestLines(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
): Promise<ChangeRequestLineRecord[]> {
  const rows = await db
    .select()
    .from(changeRequestLines)
    .where(
      and(
        eq(changeRequestLines.changeRequestId, changeRequestId),
        eq(changeRequestLines.organizationId, organizationId),
      ),
    )
    .orderBy(asc(changeRequestLines.sortOrder));

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    changeRequestId: row.changeRequestId,
    workPackageId: row.workPackageId,
    description: row.description,
    quantityEntered: row.quantityEntered,
    unitEntered: row.unitEntered,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
    currency: row.currency,
    sortOrder: row.sortOrder,
  }));
}

export async function replaceChangeRequestLines(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
  lines: readonly {
    workPackageId?: string | null;
    description: string;
    quantityEntered?: string | null;
    unitEntered?: string | null;
    unitPrice?: string | null;
    lineTotal: string;
    currency: string;
    sortOrder: number;
  }[],
): Promise<void> {
  await db
    .delete(changeRequestLines)
    .where(
      and(
        eq(changeRequestLines.changeRequestId, changeRequestId),
        eq(changeRequestLines.organizationId, organizationId),
      ),
    );

  if (lines.length === 0) return;

  await db.insert(changeRequestLines).values(
    lines.map((line) => ({
      organizationId,
      changeRequestId,
      workPackageId: line.workPackageId ?? null,
      description: line.description,
      quantityEntered: line.quantityEntered ?? null,
      unitEntered: line.unitEntered ?? null,
      unitPrice: line.unitPrice ?? null,
      lineTotal: line.lineTotal,
      currency: line.currency,
      sortOrder: line.sortOrder,
    })),
  );
}

export async function listPendingChangesForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<
  {
    status: ChangeRequestStatus;
    direction: ChangeRequestRecord['direction'];
    requestedAmount: string | null;
    currency: string;
    pricedAmount: string | null;
  }[]
> {
  const rows = await db
    .select({
      status: changeRequests.status,
      direction: changeRequests.direction,
      requestedAmount: changeRequests.requestedAmount,
      currency: changeRequests.currency,
      pricedAmount: sql<string | null>`(
        select qv.total_amount
        from quote_versions qv
        inner join quotes q on q.id = qv.quote_id
        where q.change_request_id = ${changeRequests.id}
          and qv.is_selected = true
        limit 1
      )`,
    })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.organizationId, organizationId),
        eq(changeRequests.projectId, projectId),
        isNull(changeRequests.archivedAt),
        sql`${changeRequests.status} in ('draft', 'awaiting_approval')`,
      ),
    );

  return rows;
}

export async function listWorkPackageNamesForChangeRequest(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
): Promise<string[]> {
  const byId = await listWorkPackageNamesForChangeRequests(db, organizationId, [changeRequestId]);
  return byId.get(changeRequestId) ?? [];
}

/** Batched work-package names for change-request list rows (avoids N+1). */
export async function listWorkPackageNamesForChangeRequests(
  db: DbExecutor,
  organizationId: string,
  changeRequestIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (changeRequestIds.length === 0) return result;

  const rows = await db
    .select({
      changeRequestId: changeRequestLines.changeRequestId,
      name: workPackages.name,
    })
    .from(changeRequestLines)
    .innerJoin(workPackages, eq(workPackages.id, changeRequestLines.workPackageId))
    .where(
      and(
        eq(changeRequestLines.organizationId, organizationId),
        inArray(changeRequestLines.changeRequestId, [...changeRequestIds]),
      ),
    );

  for (const row of rows) {
    const existing = result.get(row.changeRequestId) ?? [];
    if (!existing.includes(row.name)) existing.push(row.name);
    result.set(row.changeRequestId, existing);
  }

  for (const id of changeRequestIds) {
    if (!result.has(id)) result.set(id, []);
  }

  return result;
}
