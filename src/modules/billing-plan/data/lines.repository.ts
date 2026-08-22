import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  projectBillingPlanLines,
  projectBillingPlanSections,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BillingPlanLineKind,
  ProjectBillingPlanLineRecord,
  ProjectBillingPlanSectionRecord,
} from '../domain/types';

function mapSection(
  row: typeof projectBillingPlanSections.$inferSelect,
): ProjectBillingPlanSectionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    planId: row.planId,
    name: row.name,
    sortOrder: row.sortOrder,
    notes: row.notes ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLine(row: typeof projectBillingPlanLines.$inferSelect): ProjectBillingPlanLineRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    planId: row.planId,
    sectionId: row.sectionId ?? null,
    sortOrder: row.sortOrder,
    label: row.label,
    lineKind: row.lineKind as BillingPlanLineKind,
    agreedAmount: row.agreedAmount,
    agreedPercent: row.agreedPercent ?? null,
    targetDate: row.targetDate ?? null,
    milestoneLabel: row.milestoneLabel ?? null,
    retentionPercentOverride: row.retentionPercentOverride ?? null,
    boqNodeId: row.boqNodeId ?? null,
    notes: row.notes ?? null,
    isArchived: row.isArchived,
    agreedAmountSnapshot: row.agreedAmountSnapshot ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSectionsForPlan(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<ProjectBillingPlanSectionRecord[]> {
  const rows = await db
    .select()
    .from(projectBillingPlanSections)
    .where(
      and(
        eq(projectBillingPlanSections.organizationId, organizationId),
        eq(projectBillingPlanSections.planId, planId),
      ),
    )
    .orderBy(asc(projectBillingPlanSections.sortOrder), asc(projectBillingPlanSections.createdAt));
  return rows.map(mapSection);
}

export async function insertSection(
  db: DbExecutor,
  row: {
    organizationId: string;
    planId: string;
    name: string;
    sortOrder: number;
    notes?: string | null;
  },
): Promise<ProjectBillingPlanSectionRecord> {
  const [inserted] = await db
    .insert(projectBillingPlanSections)
    .values({
      organizationId: row.organizationId,
      planId: row.planId,
      name: row.name,
      sortOrder: row.sortOrder,
      notes: row.notes ?? null,
    })
    .returning();
  return mapSection(inserted!);
}

export async function listLinesForPlan(
  db: DbExecutor,
  organizationId: string,
  planId: string,
  options?: { includeArchived?: boolean },
): Promise<ProjectBillingPlanLineRecord[]> {
  const conditions = [
    eq(projectBillingPlanLines.organizationId, organizationId),
    eq(projectBillingPlanLines.planId, planId),
  ];
  if (!options?.includeArchived) {
    conditions.push(eq(projectBillingPlanLines.isArchived, false));
  }

  const rows = await db
    .select()
    .from(projectBillingPlanLines)
    .where(and(...conditions))
    .orderBy(asc(projectBillingPlanLines.sortOrder), asc(projectBillingPlanLines.createdAt));
  return rows.map(mapLine);
}

export async function findLineById(
  db: DbExecutor,
  organizationId: string,
  lineId: string,
): Promise<ProjectBillingPlanLineRecord | null> {
  const [row] = await db
    .select()
    .from(projectBillingPlanLines)
    .where(
      and(
        eq(projectBillingPlanLines.organizationId, organizationId),
        eq(projectBillingPlanLines.id, lineId),
      ),
    )
    .limit(1);
  return row ? mapLine(row) : null;
}

export async function insertLine(
  db: DbExecutor,
  row: {
    organizationId: string;
    planId: string;
    sectionId?: string | null;
    sortOrder: number;
    label: string;
    lineKind: BillingPlanLineKind;
    agreedAmount: string;
    agreedPercent?: string | null;
    targetDate?: string | null;
    milestoneLabel?: string | null;
    retentionPercentOverride?: string | null;
    boqNodeId?: string | null;
    notes?: string | null;
  },
): Promise<ProjectBillingPlanLineRecord> {
  const [inserted] = await db
    .insert(projectBillingPlanLines)
    .values({
      organizationId: row.organizationId,
      planId: row.planId,
      sectionId: row.sectionId ?? null,
      sortOrder: row.sortOrder,
      label: row.label,
      lineKind: row.lineKind,
      agreedAmount: row.agreedAmount,
      agreedPercent: row.agreedPercent ?? null,
      targetDate: row.targetDate ?? null,
      milestoneLabel: row.milestoneLabel ?? null,
      retentionPercentOverride: row.retentionPercentOverride ?? null,
      boqNodeId: row.boqNodeId ?? null,
      notes: row.notes ?? null,
      isArchived: false,
      agreedAmountSnapshot: null,
    })
    .returning();
  return mapLine(inserted!);
}

export async function insertLines(
  db: DbExecutor,
  rows: readonly Parameters<typeof insertLine>[1][],
): Promise<ProjectBillingPlanLineRecord[]> {
  if (rows.length === 0) return [];
  const inserted = await db
    .insert(projectBillingPlanLines)
    .values(
      rows.map((row) => ({
        organizationId: row.organizationId,
        planId: row.planId,
        sectionId: row.sectionId ?? null,
        sortOrder: row.sortOrder,
        label: row.label,
        lineKind: row.lineKind,
        agreedAmount: row.agreedAmount,
        agreedPercent: row.agreedPercent ?? null,
        targetDate: row.targetDate ?? null,
        milestoneLabel: row.milestoneLabel ?? null,
        retentionPercentOverride: row.retentionPercentOverride ?? null,
        boqNodeId: row.boqNodeId ?? null,
        notes: row.notes ?? null,
        isArchived: false,
        agreedAmountSnapshot: null,
      })),
    )
    .returning();
  return inserted.map(mapLine);
}

export async function updateLine(
  db: DbExecutor,
  organizationId: string,
  lineId: string,
  patch: Partial<{
    label: string;
    sectionId: string | null;
    sortOrder: number;
    agreedAmount: string;
    agreedPercent: string | null;
    targetDate: string | null;
    milestoneLabel: string | null;
    retentionPercentOverride: string | null;
    notes: string | null;
    isArchived: boolean;
    agreedAmountSnapshot: string | null;
  }>,
): Promise<ProjectBillingPlanLineRecord | null> {
  const [updated] = await db
    .update(projectBillingPlanLines)
    .set({
      ...patch,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(projectBillingPlanLines.organizationId, organizationId),
        eq(projectBillingPlanLines.id, lineId),
      ),
    )
    .returning();
  return updated ? mapLine(updated) : null;
}

export async function archiveLine(
  db: DbExecutor,
  organizationId: string,
  lineId: string,
): Promise<void> {
  await db
    .update(projectBillingPlanLines)
    .set({ isArchived: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(projectBillingPlanLines.organizationId, organizationId),
        eq(projectBillingPlanLines.id, lineId),
      ),
    );
}

export async function reorderLines(
  db: DbExecutor,
  organizationId: string,
  planId: string,
  orderedLineIds: readonly string[],
): Promise<void> {
  for (let index = 0; index < orderedLineIds.length; index += 1) {
    const lineId = orderedLineIds[index]!;
    await db
      .update(projectBillingPlanLines)
      .set({ sortOrder: index, updatedAt: sql`now()` })
      .where(
        and(
          eq(projectBillingPlanLines.organizationId, organizationId),
          eq(projectBillingPlanLines.planId, planId),
          eq(projectBillingPlanLines.id, lineId),
        ),
      );
  }
}

export async function freezeAgreedAmountSnapshots(
  db: DbExecutor,
  organizationId: string,
  lineIds: readonly string[],
  amountsByLineId: ReadonlyMap<string, string>,
): Promise<void> {
  if (lineIds.length === 0) return;
  const rows = await db
    .select()
    .from(projectBillingPlanLines)
    .where(
      and(
        eq(projectBillingPlanLines.organizationId, organizationId),
        inArray(projectBillingPlanLines.id, [...lineIds]),
      ),
    );

  for (const row of rows) {
    if (row.agreedAmountSnapshot != null) continue;
    const amount = amountsByLineId.get(row.id);
    if (amount == null) continue;
    await db
      .update(projectBillingPlanLines)
      .set({ agreedAmountSnapshot: amount, updatedAt: sql`now()` })
      .where(
        and(
          eq(projectBillingPlanLines.organizationId, organizationId),
          eq(projectBillingPlanLines.id, row.id),
        ),
      );
  }
}
