import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  drawingDistributionEntries,
  drawingRevisionAcknowledgements,
  drawingRevisions,
  drawings,
  externalPrincipals,
  projectLocations,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AcknowledgementView,
  DistributionEntryView,
  DrawingContractorVisibility,
  DrawingDiscipline,
  DrawingListItem,
  DrawingRevisionStatus,
  DrawingRevisionView,
  DrawingStatus,
} from '../domain/types';

/** Every query runs on the caller's RLS-bound executor (internal capability or contractor scope). */

export type DrawingRow = typeof drawings.$inferSelect;
export type DrawingRevisionRow = typeof drawingRevisions.$inferSelect;

export async function insertDrawing(
  db: DbExecutor,
  input: {
    readonly id: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly drawingNumber: string;
    readonly title: string;
    readonly discipline: DrawingDiscipline;
    readonly locationId: string | null;
    readonly contractorVisibility: DrawingContractorVisibility;
    readonly createdByUserId: string;
  },
): Promise<void> {
  await db.insert(drawings).values(input);
}

export async function findDrawing(
  db: DbExecutor,
  organizationId: string,
  drawingId: string,
): Promise<DrawingRow | null> {
  const [row] = await db
    .select()
    .from(drawings)
    .where(and(eq(drawings.organizationId, organizationId), eq(drawings.id, drawingId)))
    .limit(1);
  return row ?? null;
}

export async function findDrawingByNumber(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  drawingNumber: string,
): Promise<DrawingRow | null> {
  const [row] = await db
    .select()
    .from(drawings)
    .where(
      and(
        eq(drawings.organizationId, organizationId),
        eq(drawings.projectId, projectId),
        sql`lower(${drawings.drawingNumber}) = lower(${drawingNumber})`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateDrawingRow(
  db: DbExecutor,
  organizationId: string,
  drawingId: string,
  patch: Partial<{
    title: string;
    discipline: DrawingDiscipline;
    locationId: string | null;
    contractorVisibility: DrawingContractorVisibility;
    status: DrawingStatus;
    archivedAt: Date | null;
    currentRevisionId: string | null;
  }>,
): Promise<boolean> {
  const rows = await db
    .update(drawings)
    .set(patch)
    .where(and(eq(drawings.organizationId, organizationId), eq(drawings.id, drawingId)))
    .returning({ id: drawings.id });
  return rows.length === 1;
}

const PAGE_MAX = 300;

export async function listDrawingsForProject(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly status?: DrawingStatus;
    readonly discipline?: DrawingDiscipline | null;
    readonly search?: string | null;
    readonly limit?: number;
  },
): Promise<DrawingListItem[]> {
  const conditions = [
    eq(drawings.organizationId, input.organizationId),
    eq(drawings.projectId, input.projectId),
    eq(drawings.status, input.status ?? 'active'),
  ];
  if (input.discipline) conditions.push(eq(drawings.discipline, input.discipline));
  const search = input.search?.trim();
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
    conditions.push(or(ilike(drawings.drawingNumber, pattern), ilike(drawings.title, pattern))!);
  }
  const rows = await db
    .select({
      id: drawings.id,
      projectId: drawings.projectId,
      drawingNumber: drawings.drawingNumber,
      title: drawings.title,
      discipline: drawings.discipline,
      locationId: drawings.locationId,
      locationName: projectLocations.name,
      contractorVisibility: drawings.contractorVisibility,
      status: drawings.status,
      updatedAt: drawings.updatedAt,
      currentId: drawingRevisions.id,
      currentLabel: drawingRevisions.revisionLabel,
      currentIssueDate: drawingRevisions.issueDate,
      currentPublishedAt: drawingRevisions.publishedAt,
      currentAckRequired: drawingRevisions.acknowledgementRequired,
    })
    .from(drawings)
    .leftJoin(
      drawingRevisions,
      and(
        eq(drawingRevisions.id, drawings.currentRevisionId),
        eq(drawingRevisions.organizationId, drawings.organizationId),
      ),
    )
    .leftJoin(
      projectLocations,
      and(eq(projectLocations.id, drawings.locationId), eq(projectLocations.organizationId, drawings.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(asc(drawings.discipline), asc(drawings.drawingNumber))
    .limit(Math.min(Math.max(input.limit ?? PAGE_MAX, 1), PAGE_MAX));

  const ids = rows.map((row) => row.id);
  const drafts = ids.length
    ? await db
        .select({ drawingId: drawingRevisions.drawingId, value: count() })
        .from(drawingRevisions)
        .where(
          and(
            eq(drawingRevisions.organizationId, input.organizationId),
            inArray(drawingRevisions.drawingId, ids),
            eq(drawingRevisions.status, 'draft'),
          ),
        )
        .groupBy(drawingRevisions.drawingId)
    : [];
  const draftCounts = new Map(drafts.map((row) => [row.drawingId, Number(row.value)] as const));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    drawingNumber: row.drawingNumber,
    title: row.title,
    discipline: row.discipline,
    locationId: row.locationId,
    locationName: row.locationName ?? null,
    contractorVisibility: row.contractorVisibility,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    draftCount: draftCounts.get(row.id) ?? 0,
    currentRevision: row.currentId
      ? {
          id: row.currentId,
          revisionLabel: row.currentLabel!,
          issueDate: row.currentIssueDate ?? null,
          publishedAt: row.currentPublishedAt?.toISOString() ?? null,
          acknowledgementRequired: Boolean(row.currentAckRequired),
        }
      : null,
  }));
}

export function toRevisionView(row: DrawingRevisionRow): DrawingRevisionView {
  return {
    id: row.id,
    drawingId: row.drawingId,
    revisionLabel: row.revisionLabel,
    sequence: row.sequence,
    status: row.status,
    issueDate: row.issueDate ?? null,
    description: row.description ?? null,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes ?? null,
    fileReady: row.fileReady,
    acknowledgementRequired: row.acknowledgementRequired,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    supersedesRevisionId: row.supersedesRevisionId ?? null,
    supersededByRevisionId: row.supersededByRevisionId ?? null,
  };
}

export async function listRevisions(
  db: DbExecutor,
  organizationId: string,
  drawingId: string,
  options: { readonly publishedOnly?: boolean; readonly includeWithdrawn?: boolean } = {},
): Promise<DrawingRevisionRow[]> {
  const conditions = [eq(drawingRevisions.organizationId, organizationId), eq(drawingRevisions.drawingId, drawingId)];
  if (options.publishedOnly) conditions.push(inArray(drawingRevisions.status, ['current', 'superseded']));
  else if (!options.includeWithdrawn) conditions.push(ne(drawingRevisions.status, 'withdrawn'));
  return db
    .select()
    .from(drawingRevisions)
    .where(and(...conditions))
    .orderBy(desc(drawingRevisions.sequence));
}

export async function findRevision(
  db: DbExecutor,
  organizationId: string,
  revisionId: string,
): Promise<DrawingRevisionRow | null> {
  const [row] = await db
    .select()
    .from(drawingRevisions)
    .where(and(eq(drawingRevisions.organizationId, organizationId), eq(drawingRevisions.id, revisionId)))
    .limit(1);
  return row ?? null;
}

/** Org-agnostic lookup for file routes; RLS decides visibility. */
export async function findVisibleRevision(db: DbExecutor, revisionId: string): Promise<DrawingRevisionRow | null> {
  const [row] = await db.select().from(drawingRevisions).where(eq(drawingRevisions.id, revisionId)).limit(1);
  return row ?? null;
}

export async function insertRevision(
  db: DbExecutor,
  input: {
    readonly id: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly drawingId: string;
    readonly revisionLabel: string;
    readonly sequence: number;
    readonly issueDate: string | null;
    readonly description: string | null;
    readonly documentId: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number | null;
    readonly fileReady: boolean;
    readonly acknowledgementRequired: boolean;
    readonly createdByUserId: string;
  },
): Promise<void> {
  await db.insert(drawingRevisions).values({ ...input, status: 'draft' });
}

export async function updateRevisionRow(
  db: DbExecutor,
  organizationId: string,
  revisionId: string,
  expectedStatus: DrawingRevisionStatus,
  patch: Partial<{
    status: DrawingRevisionStatus;
    fileReady: boolean;
    sizeBytes: number | null;
    publishedAt: Date;
    publishedByUserId: string;
    supersedesRevisionId: string | null;
    supersededAt: Date;
    supersededByRevisionId: string;
  }>,
): Promise<boolean> {
  const rows = await db
    .update(drawingRevisions)
    .set(patch)
    .where(
      and(
        eq(drawingRevisions.organizationId, organizationId),
        eq(drawingRevisions.id, revisionId),
        eq(drawingRevisions.status, expectedStatus),
      ),
    )
    .returning({ id: drawingRevisions.id });
  return rows.length === 1;
}

export async function listDistribution(
  db: DbExecutor,
  organizationId: string,
  drawingId: string,
): Promise<DistributionEntryView[]> {
  const rows = await db
    .select({
      id: drawingDistributionEntries.id,
      audience: drawingDistributionEntries.audience,
      vendorId: drawingDistributionEntries.vendorId,
      vendorName: vendors.name,
      agreementId: drawingDistributionEntries.subcontractAgreementId,
      agreementTitle: subcontractAgreements.title,
      principalId: drawingDistributionEntries.principalId,
      principalName: externalPrincipals.displayName,
      principalEmail: externalPrincipals.email,
    })
    .from(drawingDistributionEntries)
    .leftJoin(
      vendors,
      and(eq(vendors.id, drawingDistributionEntries.vendorId), eq(vendors.organizationId, drawingDistributionEntries.organizationId)),
    )
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, drawingDistributionEntries.subcontractAgreementId),
        eq(subcontractAgreements.organizationId, drawingDistributionEntries.organizationId),
      ),
    )
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, drawingDistributionEntries.principalId))
    .where(
      and(
        eq(drawingDistributionEntries.organizationId, organizationId),
        eq(drawingDistributionEntries.drawingId, drawingId),
      ),
    )
    .orderBy(asc(drawingDistributionEntries.createdAt));
  return rows.map((row) => ({
    id: row.id,
    audience: row.audience,
    vendorId: row.vendorId ?? null,
    vendorName: row.vendorName ?? null,
    agreementId: row.agreementId ?? null,
    agreementTitle: row.agreementTitle ?? null,
    principalId: row.principalId ?? null,
    principalName: row.principalName ?? row.principalEmail ?? null,
  }));
}

export async function insertDistributionEntry(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly drawingId: string;
    readonly audience: 'agreement' | 'principal';
    readonly vendorId: string | null;
    readonly subcontractAgreementId: string | null;
    readonly principalId: string | null;
    readonly addedByUserId: string;
  },
): Promise<void> {
  await db.insert(drawingDistributionEntries).values(input);
}

export async function deleteDistributionEntries(
  db: DbExecutor,
  organizationId: string,
  drawingId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .delete(drawingDistributionEntries)
    .where(
      and(
        eq(drawingDistributionEntries.organizationId, organizationId),
        eq(drawingDistributionEntries.drawingId, drawingId),
        inArray(drawingDistributionEntries.id, [...ids]),
      ),
    );
}

export async function listRevisionAcknowledgements(
  db: DbExecutor,
  organizationId: string,
  revisionIds: readonly string[],
): Promise<Map<string, AcknowledgementView[]>> {
  const result = new Map<string, AcknowledgementView[]>();
  if (revisionIds.length === 0) return result;
  const rows = await db
    .select({
      revisionId: drawingRevisionAcknowledgements.revisionId,
      principalId: drawingRevisionAcknowledgements.principalId,
      principalName: externalPrincipals.displayName,
      principalEmail: externalPrincipals.email,
      vendorId: drawingRevisionAcknowledgements.vendorId,
      vendorName: vendors.name,
      acknowledgedAt: drawingRevisionAcknowledgements.acknowledgedAt,
    })
    .from(drawingRevisionAcknowledgements)
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, drawingRevisionAcknowledgements.principalId))
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, drawingRevisionAcknowledgements.vendorId),
        eq(vendors.organizationId, drawingRevisionAcknowledgements.organizationId),
      ),
    )
    .where(
      and(
        eq(drawingRevisionAcknowledgements.organizationId, organizationId),
        inArray(drawingRevisionAcknowledgements.revisionId, [...revisionIds]),
      ),
    )
    .orderBy(asc(drawingRevisionAcknowledgements.acknowledgedAt));
  for (const row of rows) {
    const list = result.get(row.revisionId) ?? [];
    list.push({
      principalId: row.principalId,
      principalName: row.principalName ?? row.principalEmail ?? null,
      vendorId: row.vendorId,
      vendorName: row.vendorName ?? null,
      acknowledgedAt: row.acknowledgedAt.toISOString(),
    });
    result.set(row.revisionId, list);
  }
  return result;
}

/** Idempotent: a second acknowledgement by the same principal is a no-op. Returns true when inserted. */
export async function insertRevisionAcknowledgement(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly drawingId: string;
    readonly revisionId: string;
    readonly principalId: string;
    readonly vendorId: string;
  },
): Promise<boolean> {
  const existing = await db
    .select({ id: drawingRevisionAcknowledgements.id })
    .from(drawingRevisionAcknowledgements)
    .where(
      and(
        eq(drawingRevisionAcknowledgements.revisionId, input.revisionId),
        eq(drawingRevisionAcknowledgements.principalId, input.principalId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;
  await db.insert(drawingRevisionAcknowledgements).values(input);
  return true;
}

export async function myRevisionAcknowledgements(
  db: DbExecutor,
  organizationId: string,
  principalId: string,
  revisionIds: readonly string[],
): Promise<Map<string, string>> {
  if (revisionIds.length === 0) return new Map();
  const rows = await db
    .select({
      revisionId: drawingRevisionAcknowledgements.revisionId,
      acknowledgedAt: drawingRevisionAcknowledgements.acknowledgedAt,
    })
    .from(drawingRevisionAcknowledgements)
    .where(
      and(
        eq(drawingRevisionAcknowledgements.organizationId, organizationId),
        eq(drawingRevisionAcknowledgements.principalId, principalId),
        inArray(drawingRevisionAcknowledgements.revisionId, [...revisionIds]),
      ),
    );
  return new Map(rows.map((row) => [row.revisionId, row.acknowledgedAt.toISOString()] as const));
}

/** Contractor-visible drawings (RLS decides) with their current revision. */
export async function listVisibleDrawingsWithCurrent(
  db: DbExecutor,
  input: { readonly organizationId: string; readonly projectId: string; readonly limit?: number },
) {
  return db
    .select({
      id: drawings.id,
      projectId: drawings.projectId,
      drawingNumber: drawings.drawingNumber,
      title: drawings.title,
      discipline: drawings.discipline,
      locationName: projectLocations.name,
      currentRevisionId: drawingRevisions.id,
      revisionLabel: drawingRevisions.revisionLabel,
      issueDate: drawingRevisions.issueDate,
      publishedAt: drawingRevisions.publishedAt,
      acknowledgementRequired: drawingRevisions.acknowledgementRequired,
      fileName: drawingRevisions.fileName,
      mimeType: drawingRevisions.mimeType,
    })
    .from(drawings)
    .innerJoin(
      drawingRevisions,
      and(
        eq(drawingRevisions.id, drawings.currentRevisionId),
        eq(drawingRevisions.organizationId, drawings.organizationId),
      ),
    )
    .leftJoin(
      projectLocations,
      and(eq(projectLocations.id, drawings.locationId), eq(projectLocations.organizationId, drawings.organizationId)),
    )
    .where(
      and(
        eq(drawings.organizationId, input.organizationId),
        eq(drawings.projectId, input.projectId),
        eq(drawings.status, 'active'),
        isNull(drawings.archivedAt),
      ),
    )
    .orderBy(desc(drawingRevisions.publishedAt))
    .limit(Math.min(Math.max(input.limit ?? PAGE_MAX, 1), PAGE_MAX));
}
