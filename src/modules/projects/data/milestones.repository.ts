import { and, asc, eq, isNull } from 'drizzle-orm';
import { projectMilestones } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { MilestoneRecord, MilestoneStatus } from '../domain/types';

function mapMilestone(row: typeof projectMilestones.$inferSelect): MilestoneRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    name: row.name,
    targetDate: row.targetDate,
    completedAt: row.completedAt,
    status: row.status as MilestoneStatus,
    sortOrder: row.sortOrder,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listMilestonesByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<MilestoneRecord[]> {
  const rows = await db
    .select()
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, organizationId),
        eq(projectMilestones.projectId, projectId),
        isNull(projectMilestones.archivedAt),
      ),
    )
    .orderBy(asc(projectMilestones.sortOrder), asc(projectMilestones.targetDate));

  return rows.map(mapMilestone);
}

export async function insertMilestone(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    workPackageId?: string | null;
    name: string;
    targetDate?: string | null;
    status?: MilestoneStatus;
    sortOrder?: number;
    notes?: string | null;
  },
): Promise<MilestoneRecord> {
  const [row] = await db
    .insert(projectMilestones)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      workPackageId: input.workPackageId ?? null,
      name: input.name,
      targetDate: input.targetDate ?? null,
      status: input.status ?? 'planned',
      sortOrder: input.sortOrder ?? 0,
      notes: input.notes ?? null,
    })
    .returning();

  return mapMilestone(row!);
}

export async function updateMilestoneById(
  db: DbExecutor,
  organizationId: string,
  milestoneId: string,
  patch: Partial<{
    name: string;
    workPackageId: string | null;
    targetDate: string | null;
    completedAt: string | null;
    status: MilestoneStatus;
    sortOrder: number;
    notes: string | null;
    archivedAt: Date | null;
  }>,
): Promise<MilestoneRecord | null> {
  const [row] = await db
    .update(projectMilestones)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.organizationId, organizationId)),
    )
    .returning();

  return row ? mapMilestone(row) : null;
}

export async function findMilestoneById(
  db: DbExecutor,
  organizationId: string,
  milestoneId: string,
): Promise<MilestoneRecord | null> {
  const [row] = await db
    .select()
    .from(projectMilestones)
    .where(
      and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapMilestone(row) : null;
}
