import { and, asc, eq, isNull } from 'drizzle-orm';
import { phases } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { PhaseRecord } from '../domain/types';

function mapPhase(row: typeof phases.$inferSelect): PhaseRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertPhase(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    workPackageId: string;
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    sortOrder?: number;
  },
): Promise<PhaseRecord> {
  const [row] = await db
    .insert(phases)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      workPackageId: input.workPackageId,
      name: input.name,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return mapPhase(row!);
}

export async function listPhasesByWorkPackage(
  db: DbExecutor,
  organizationId: string,
  workPackageId: string,
  options: { includeArchived?: boolean } = {},
): Promise<PhaseRecord[]> {
  const conditions = [
    eq(phases.organizationId, organizationId),
    eq(phases.workPackageId, workPackageId),
  ];

  if (!options.includeArchived) {
    conditions.push(isNull(phases.archivedAt));
  }

  const rows = await db
    .select()
    .from(phases)
    .where(and(...conditions))
    .orderBy(asc(phases.sortOrder), asc(phases.name));

  return rows.map(mapPhase);
}

export async function listPhasesByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<PhaseRecord[]> {
  const rows = await db
    .select()
    .from(phases)
    .where(
      and(
        eq(phases.organizationId, organizationId),
        eq(phases.projectId, projectId),
        isNull(phases.archivedAt),
      ),
    )
    .orderBy(asc(phases.sortOrder), asc(phases.name));

  return rows.map(mapPhase);
}

export async function findPhaseById(
  db: DbExecutor,
  organizationId: string,
  phaseId: string,
): Promise<PhaseRecord | null> {
  const [row] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.organizationId, organizationId)))
    .limit(1);

  return row ? mapPhase(row) : null;
}

export async function updatePhaseById(
  db: DbExecutor,
  organizationId: string,
  phaseId: string,
  patch: Partial<{
    name: string;
    startDate: string | null;
    endDate: string | null;
    sortOrder: number;
    archivedAt: Date | null;
  }>,
): Promise<PhaseRecord | null> {
  const [row] = await db
    .update(phases)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(phases.id, phaseId), eq(phases.organizationId, organizationId)))
    .returning();

  return row ? mapPhase(row) : null;
}

export async function nextPhaseSortOrder(
  db: DbExecutor,
  organizationId: string,
  workPackageId: string,
): Promise<number> {
  const existing = await listPhasesByWorkPackage(db, organizationId, workPackageId);
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((phase) => phase.sortOrder)) + 1;
}
