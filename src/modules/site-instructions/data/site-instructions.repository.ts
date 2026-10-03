import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { entityLinks, siteInstructionEvents, siteInstructions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { SiteInstructionStatus } from '../domain/lifecycle';

export type InstructionRow = typeof siteInstructions.$inferSelect;
export type InstructionEventRow = typeof siteInstructionEvents.$inferSelect;

export async function insertInstruction(
  db: DbExecutor,
  values: typeof siteInstructions.$inferInsert,
): Promise<InstructionRow> {
  const [row] = await db.insert(siteInstructions).values(values).returning();
  return row!;
}

export async function findInstruction(
  db: DbExecutor,
  organizationId: string,
  instructionId: string,
): Promise<InstructionRow | null> {
  const [row] = await db
    .select()
    .from(siteInstructions)
    .where(and(eq(siteInstructions.id, instructionId), eq(siteInstructions.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** External lookup: RLS decides visibility; organization comes from the row itself. */
export async function findInstructionInProject(
  db: DbExecutor,
  projectId: string,
  instructionId: string,
): Promise<InstructionRow | null> {
  const [row] = await db
    .select()
    .from(siteInstructions)
    .where(and(eq(siteInstructions.id, instructionId), eq(siteInstructions.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function updateInstructionContent(
  db: DbExecutor,
  organizationId: string,
  instructionId: string,
  patch: Pick<InstructionRow, 'title' | 'description' | 'locationId' | 'dueDate'>,
): Promise<InstructionRow | null> {
  const [row] = await db
    .update(siteInstructions)
    .set(patch)
    .where(and(eq(siteInstructions.id, instructionId), eq(siteInstructions.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export interface InstructionListFilter {
  readonly statuses: readonly SiteInstructionStatus[] | null;
  readonly vendorId: string | null;
  readonly limit: number;
  readonly offset: number;
}

export async function listInstructionsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  filter: InstructionListFilter,
): Promise<{ rows: InstructionRow[]; hasMore: boolean }> {
  const conditions = [eq(siteInstructions.organizationId, organizationId), eq(siteInstructions.projectId, projectId)];
  if (filter.statuses) conditions.push(inArray(siteInstructions.status, [...filter.statuses]));
  if (filter.vendorId) conditions.push(eq(siteInstructions.vendorId, filter.vendorId));
  const rows = await db
    .select()
    .from(siteInstructions)
    .where(and(...conditions))
    .orderBy(desc(siteInstructions.instructionNumber))
    .limit(filter.limit + 1)
    .offset(filter.offset);
  return { rows: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
}

/** Contractor list (RLS-scoped to its vendor/agreement grants). */
export async function listInstructionsVisibleInProject(
  db: DbExecutor,
  projectId: string,
  organizationIds: readonly string[],
  statuses: readonly SiteInstructionStatus[] | null,
  limit: number,
): Promise<InstructionRow[]> {
  if (organizationIds.length === 0) return [];
  const conditions = [
    eq(siteInstructions.projectId, projectId),
    inArray(siteInstructions.organizationId, [...organizationIds]),
  ];
  if (statuses) conditions.push(inArray(siteInstructions.status, [...statuses]));
  return db
    .select()
    .from(siteInstructions)
    .where(and(...conditions))
    .orderBy(desc(siteInstructions.instructionNumber))
    .limit(limit);
}

/** Pending acknowledgements visible to the caller (RLS-scoped), optionally one project. */
export async function listPendingAckInstructions(
  db: DbExecutor,
  organizationIds: readonly string[],
  projectId: string | null,
  limit: number,
): Promise<{ rows: InstructionRow[]; total: number }> {
  if (organizationIds.length === 0) return { rows: [], total: 0 };
  const conditions = [
    inArray(siteInstructions.organizationId, [...organizationIds]),
    eq(siteInstructions.status, 'issued'),
  ];
  if (projectId) conditions.push(eq(siteInstructions.projectId, projectId));
  const [rows, [count]] = await Promise.all([
    db
      .select()
      .from(siteInstructions)
      .where(and(...conditions))
      .orderBy(asc(siteInstructions.dueDate), asc(siteInstructions.issuedAt))
      .limit(limit),
    db.select({ total: sql<number>`count(*)::int` }).from(siteInstructions).where(and(...conditions)),
  ]);
  return { rows, total: Number(count?.total ?? 0) };
}

export async function insertInstructionEvent(
  db: DbExecutor,
  values: typeof siteInstructionEvents.$inferInsert,
): Promise<InstructionEventRow> {
  const [row] = await db.insert(siteInstructionEvents).values(values).returning();
  return row!;
}

export async function listInstructionEvents(
  db: DbExecutor,
  organizationId: string,
  instructionId: string,
): Promise<InstructionEventRow[]> {
  return db
    .select()
    .from(siteInstructionEvents)
    .where(
      and(eq(siteInstructionEvents.organizationId, organizationId), eq(siteInstructionEvents.instructionId, instructionId)),
    )
    .orderBy(asc(siteInstructionEvents.occurredAt), asc(siteInstructionEvents.id))
    .limit(500);
}

export interface InstructionLinkRow {
  readonly targetType: string;
  readonly targetId: string;
  readonly relation: string;
  readonly createdAt: Date;
}

export async function listInstructionLinks(
  db: DbExecutor,
  organizationId: string,
  instructionId: string,
): Promise<InstructionLinkRow[]> {
  return db
    .select({
      targetType: entityLinks.targetType,
      targetId: entityLinks.targetId,
      relation: entityLinks.relation,
      createdAt: entityLinks.createdAt,
    })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.organizationId, organizationId),
        eq(entityLinks.sourceType, 'site_instruction'),
        eq(entityLinks.sourceId, instructionId),
      ),
    )
    .orderBy(asc(entityLinks.createdAt))
    .limit(100);
}

export async function insertInstructionLink(
  db: DbExecutor,
  values: {
    organizationId: string;
    projectId: string;
    instructionId: string;
    targetType: string;
    targetId: string;
    relation: string;
    actorUserId: string;
  },
): Promise<void> {
  await db
    .insert(entityLinks)
    .values({
      organizationId: values.organizationId,
      projectId: values.projectId,
      sourceType: 'site_instruction',
      sourceId: values.instructionId,
      targetType: values.targetType,
      targetId: values.targetId,
      relation: values.relation,
      actorType: 'internal',
      actorUserId: values.actorUserId,
    })
    .onConflictDoNothing();
}
