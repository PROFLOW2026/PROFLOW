import { and, desc, eq, inArray } from 'drizzle-orm';
import { profiles, projectCloseoutEvents, projectCloseouts } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CloseoutEventKind,
  CloseoutEventRecord,
  CloseoutRecord,
  CloseoutStatus,
} from '../domain/types';

function mapCloseout(row: typeof projectCloseouts.$inferSelect): CloseoutRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    status: row.status as CloseoutStatus,
    financialSnapshotJson: row.financialSnapshotJson,
    closeReason: row.closeReason,
    reopenReason: row.reopenReason,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    reopenedAt: row.reopenedAt,
    reopenedByUserId: row.reopenedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(
  row: typeof projectCloseoutEvents.$inferSelect,
  actorName: string | null,
): CloseoutEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    closeoutId: row.closeoutId,
    projectId: row.projectId,
    eventKind: row.eventKind as CloseoutEventKind,
    reason: row.reason,
    snapshotJson: row.snapshotJson,
    actorUserId: row.actorUserId,
    actorName,
    createdAt: row.createdAt,
  };
}

export async function findCloseoutByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CloseoutRecord | null> {
  const [row] = await db
    .select()
    .from(projectCloseouts)
    .where(
      and(
        eq(projectCloseouts.organizationId, organizationId),
        eq(projectCloseouts.projectId, projectId),
      ),
    )
    .limit(1);
  return row ? mapCloseout(row) : null;
}

export async function insertCloseout(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    status?: CloseoutStatus;
  },
): Promise<CloseoutRecord> {
  const [row] = await db
    .insert(projectCloseouts)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      status: input.status ?? 'open',
    })
    .returning();
  return mapCloseout(row!);
}

export async function updateCloseoutById(
  db: DbExecutor,
  organizationId: string,
  closeoutId: string,
  patch: Partial<{
    status: CloseoutStatus;
    financialSnapshotJson: unknown;
    closeReason: string | null;
    reopenReason: string | null;
    closedAt: Date | null;
    closedByUserId: string | null;
    reopenedAt: Date | null;
    reopenedByUserId: string | null;
  }>,
): Promise<CloseoutRecord | null> {
  const [row] = await db
    .update(projectCloseouts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(projectCloseouts.id, closeoutId), eq(projectCloseouts.organizationId, organizationId)),
    )
    .returning();
  return row ? mapCloseout(row) : null;
}

export async function insertCloseoutEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    closeoutId: string;
    projectId: string;
    eventKind: CloseoutEventKind;
    reason?: string | null;
    snapshotJson?: unknown;
    actorUserId?: string | null;
  },
): Promise<CloseoutEventRecord> {
  const [row] = await db
    .insert(projectCloseoutEvents)
    .values({
      organizationId: input.organizationId,
      closeoutId: input.closeoutId,
      projectId: input.projectId,
      eventKind: input.eventKind,
      reason: input.reason ?? null,
      snapshotJson: input.snapshotJson ?? null,
      actorUserId: input.actorUserId ?? null,
    })
    .returning();
  return mapEvent(row!, null);
}

export async function listCloseoutEvents(
  db: DbExecutor,
  organizationId: string,
  closeoutId: string,
): Promise<CloseoutEventRecord[]> {
  const rows = await db
    .select({
      event: projectCloseoutEvents,
      actorName: profiles.displayName,
    })
    .from(projectCloseoutEvents)
    .leftJoin(profiles, eq(profiles.id, projectCloseoutEvents.actorUserId))
    .where(
      and(
        eq(projectCloseoutEvents.organizationId, organizationId),
        eq(projectCloseoutEvents.closeoutId, closeoutId),
      ),
    )
    .orderBy(desc(projectCloseoutEvents.createdAt));

  return rows.map((row) => mapEvent(row.event, row.actorName));
}

export async function listCloseoutStatusesByProjectIds(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<readonly { readonly projectId: string; readonly status: CloseoutStatus }[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      projectId: projectCloseouts.projectId,
      status: projectCloseouts.status,
    })
    .from(projectCloseouts)
    .where(
      and(
        eq(projectCloseouts.organizationId, organizationId),
        inArray(projectCloseouts.projectId, [...projectIds]),
      ),
    );
  return rows.map((row) => ({
    projectId: row.projectId,
    status: row.status as CloseoutStatus,
  }));
}
