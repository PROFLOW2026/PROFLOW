import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { monthCloseAdjustments, monthClosePeriods, projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CompletenessSnapshot,
  MonthCloseAdjustment,
  MonthCloseAdjustmentType,
  MonthCloseEffectSide,
  MonthClosePeriod,
  MonthCloseProjectOption,
  MonthCloseStatus,
} from '../domain/types';

function mapPeriod(row: typeof monthClosePeriods.$inferSelect): MonthClosePeriod {
  const snapshot = row.completenessSnapshot as CompletenessSnapshot | null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    yearMonth: row.yearMonth,
    status: row.status as MonthCloseStatus,
    completenessPercent: row.completenessPercent,
    completenessSnapshot: snapshot,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAdjustment(
  row: typeof monthCloseAdjustments.$inferSelect,
  projectName: string | null = null,
): MonthCloseAdjustment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    periodId: row.periodId,
    adjustmentType: row.adjustmentType as MonthCloseAdjustmentType,
    reason: row.reason,
    entityType: row.entityType,
    entityId: row.entityId,
    amount: row.amount,
    currency: row.currency ? row.currency.trim() : null,
    effectSide: (row.effectSide as MonthCloseEffectSide | null) ?? null,
    projectId: row.projectId,
    projectName,
    supersedesAdjustmentId: row.supersedesAdjustmentId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listMonthClosePeriods(
  db: DbExecutor,
  organizationId: string,
  limit = 18,
): Promise<MonthClosePeriod[]> {
  const rows = await db
    .select()
    .from(monthClosePeriods)
    .where(eq(monthClosePeriods.organizationId, organizationId))
    .orderBy(desc(monthClosePeriods.yearMonth))
    .limit(limit);
  return rows.map(mapPeriod);
}

export async function findPeriodById(
  db: DbExecutor,
  organizationId: string,
  periodId: string,
): Promise<MonthClosePeriod | null> {
  const rows = await db
    .select()
    .from(monthClosePeriods)
    .where(
      and(eq(monthClosePeriods.id, periodId), eq(monthClosePeriods.organizationId, organizationId)),
    )
    .limit(1);
  return rows[0] ? mapPeriod(rows[0]) : null;
}

export async function findPeriodByYearMonth(
  db: DbExecutor,
  organizationId: string,
  yearMonth: string,
): Promise<MonthClosePeriod | null> {
  const rows = await db
    .select()
    .from(monthClosePeriods)
    .where(
      and(
        eq(monthClosePeriods.organizationId, organizationId),
        eq(monthClosePeriods.yearMonth, yearMonth),
      ),
    )
    .limit(1);
  return rows[0] ? mapPeriod(rows[0]) : null;
}

export async function insertMonthClosePeriod(
  db: DbExecutor,
  input: {
    organizationId: string;
    yearMonth: string;
    notes?: string | null;
    completenessPercent?: string | null;
    completenessSnapshot?: CompletenessSnapshot | null;
  },
): Promise<MonthClosePeriod> {
  const [row] = await db
    .insert(monthClosePeriods)
    .values({
      organizationId: input.organizationId,
      yearMonth: input.yearMonth,
      status: 'open',
      notes: input.notes ?? null,
      completenessPercent: input.completenessPercent ?? null,
      completenessSnapshot: input.completenessSnapshot ?? null,
    })
    .returning();
  return mapPeriod(row!);
}

export async function updatePeriodCompleteness(
  db: DbExecutor,
  organizationId: string,
  periodId: string,
  completenessPercent: string,
  completenessSnapshot: CompletenessSnapshot,
): Promise<MonthClosePeriod | null> {
  const [row] = await db
    .update(monthClosePeriods)
    .set({
      completenessPercent,
      completenessSnapshot,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(monthClosePeriods.id, periodId), eq(monthClosePeriods.organizationId, organizationId)),
    )
    .returning();
  return row ? mapPeriod(row) : null;
}

export async function updatePeriodStatus(
  db: DbExecutor,
  organizationId: string,
  periodId: string,
  patch: {
    status: MonthCloseStatus;
    closedAt?: Date | null;
    closedByUserId?: string | null;
    notes?: string | null;
    completenessPercent?: string | null;
    completenessSnapshot?: CompletenessSnapshot | null;
  },
): Promise<MonthClosePeriod | null> {
  const [row] = await db
    .update(monthClosePeriods)
    .set({
      status: patch.status,
      closedAt: patch.closedAt === undefined ? undefined : patch.closedAt,
      closedByUserId: patch.closedByUserId === undefined ? undefined : patch.closedByUserId,
      notes: patch.notes === undefined ? undefined : patch.notes,
      completenessPercent:
        patch.completenessPercent === undefined ? undefined : patch.completenessPercent,
      completenessSnapshot:
        patch.completenessSnapshot === undefined ? undefined : patch.completenessSnapshot,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(monthClosePeriods.id, periodId), eq(monthClosePeriods.organizationId, organizationId)),
    )
    .returning();
  return row ? mapPeriod(row) : null;
}

export async function listAdjustmentsForPeriod(
  db: DbExecutor,
  organizationId: string,
  periodId: string,
): Promise<MonthCloseAdjustment[]> {
  const rows = await db
    .select({
      adjustment: monthCloseAdjustments,
      projectName: projects.name,
    })
    .from(monthCloseAdjustments)
    .leftJoin(
      projects,
      and(
        eq(projects.id, monthCloseAdjustments.projectId),
        eq(projects.organizationId, monthCloseAdjustments.organizationId),
      ),
    )
    .where(
      and(
        eq(monthCloseAdjustments.organizationId, organizationId),
        eq(monthCloseAdjustments.periodId, periodId),
      ),
    )
    .orderBy(desc(monthCloseAdjustments.createdAt));
  return rows.map((row) => mapAdjustment(row.adjustment, row.projectName ?? null));
}

export async function findAdjustmentById(
  db: DbExecutor,
  organizationId: string,
  adjustmentId: string,
): Promise<MonthCloseAdjustment | null> {
  const rows = await db
    .select({
      adjustment: monthCloseAdjustments,
      projectName: projects.name,
    })
    .from(monthCloseAdjustments)
    .leftJoin(
      projects,
      and(
        eq(projects.id, monthCloseAdjustments.projectId),
        eq(projects.organizationId, monthCloseAdjustments.organizationId),
      ),
    )
    .where(
      and(
        eq(monthCloseAdjustments.id, adjustmentId),
        eq(monthCloseAdjustments.organizationId, organizationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? mapAdjustment(row.adjustment, row.projectName ?? null) : null;
}

export async function findSupersedingAdjustment(
  db: DbExecutor,
  organizationId: string,
  targetAdjustmentId: string,
): Promise<MonthCloseAdjustment | null> {
  const rows = await db
    .select()
    .from(monthCloseAdjustments)
    .where(
      and(
        eq(monthCloseAdjustments.organizationId, organizationId),
        eq(monthCloseAdjustments.supersedesAdjustmentId, targetAdjustmentId),
      ),
    )
    .limit(1);
  return rows[0] ? mapAdjustment(rows[0]) : null;
}

export async function findProjectInOrg(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; currency: string | null } | null> {
  const rows = await db
    .select({ id: projects.id, currency: projects.currency })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listProjectOptionsForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<MonthCloseProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name))
    .limit(500);
}

export async function insertMonthCloseAdjustment(
  db: DbExecutor,
  input: {
    organizationId: string;
    periodId: string;
    adjustmentType: MonthCloseAdjustmentType;
    reason: string;
    entityType?: string | null;
    entityId?: string | null;
    amount?: string | null;
    currency?: string | null;
    effectSide?: MonthCloseEffectSide | null;
    projectId?: string | null;
    supersedesAdjustmentId?: string | null;
    createdByUserId?: string | null;
  },
): Promise<MonthCloseAdjustment> {
  const [row] = await db
    .insert(monthCloseAdjustments)
    .values({
      organizationId: input.organizationId,
      periodId: input.periodId,
      adjustmentType: input.adjustmentType,
      reason: input.reason,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      effectSide: input.effectSide ?? null,
      projectId: input.projectId ?? null,
      supersedesAdjustmentId: input.supersedesAdjustmentId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  return mapAdjustment(row!);
}
