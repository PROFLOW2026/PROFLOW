import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import {
  safetyCorrectiveActions,
  safetyRecords,
  safetyToolboxAttendees,
  safetyToolboxTalks,
} from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  SafetyActionStatus,
  SafetyCorrectiveActionRecord,
  SafetyListFilters,
  SafetyRecordRecord,
  SafetyRecordStatus,
  SafetyRecordType,
  SafetySeverity,
  SafetyToolboxAttendeeRecord,
  SafetyToolboxTalkRecord,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapRecord(row: typeof safetyRecords.$inferSelect): SafetyRecordRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    recordType: row.recordType as SafetyRecordType,
    occurredAt: row.occurredAt,
    reporterUserId: row.reporterUserId,
    severity: row.severity as SafetySeverity,
    title: row.title,
    description: row.description,
    peopleInvolved: row.peopleInvolved,
    immediateAction: row.immediateAction,
    status: row.status as SafetyRecordStatus,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAction(row: typeof safetyCorrectiveActions.$inferSelect): SafetyCorrectiveActionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    safetyRecordId: row.safetyRecordId,
    title: row.title,
    description: row.description,
    ownerUserId: row.ownerUserId,
    dueDate: asDateString(row.dueDate),
    status: row.status as SafetyActionStatus,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTalk(row: typeof safetyToolboxTalks.$inferSelect): SafetyToolboxTalkRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    safetyRecordId: row.safetyRecordId,
    topic: row.topic,
    talkDate: asDateString(row.talkDate) ?? row.talkDate,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAttendee(row: typeof safetyToolboxAttendees.$inferSelect): SafetyToolboxAttendeeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    toolboxTalkId: row.toolboxTalkId,
    employeeId: row.employeeId,
    attendeeName: row.attendeeName,
    acknowledgedAt: row.acknowledgedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSafetyRecords(
  db: DbExecutor,
  organizationId: string,
  filters: SafetyListFilters = {},
): Promise<SafetyRecordRecord[]> {
  const where = [eq(safetyRecords.organizationId, organizationId), isNull(safetyRecords.archivedAt)];
  if (filters.projectId) where.push(eq(safetyRecords.projectId, filters.projectId));
  if (filters.recordType) where.push(eq(safetyRecords.recordType, filters.recordType));
  if (filters.status) where.push(eq(safetyRecords.status, filters.status));
  if (filters.severity) where.push(eq(safetyRecords.severity, filters.severity));

  const rows = await db
    .select()
    .from(safetyRecords)
    .where(and(...where))
    .orderBy(desc(safetyRecords.occurredAt), desc(safetyRecords.createdAt))
    .limit(
      resolveListLimit(filters.limit, {
        hardCap:
          filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filters.offset));
  return rows.map(mapRecord);
}

export async function insertSafetyRecord(
  db: DbExecutor,
  values: typeof safetyRecords.$inferInsert,
): Promise<SafetyRecordRecord> {
  const [row] = await db.insert(safetyRecords).values(values).returning();
  if (!row) throw new Error('Failed to insert safety record');
  return mapRecord(row);
}

export async function findSafetyRecordById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<SafetyRecordRecord | null> {
  const [row] = await db
    .select()
    .from(safetyRecords)
    .where(and(eq(safetyRecords.id, id), eq(safetyRecords.organizationId, organizationId)))
    .limit(1);
  return row ? mapRecord(row) : null;
}

export async function findSafetyRecordByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<SafetyRecordRecord | null> {
  const [row] = await db
    .select()
    .from(safetyRecords)
    .where(and(eq(safetyRecords.id, id), eq(safetyRecords.organizationId, organizationId)))
    .for('update')
    .limit(1);
  return row ? mapRecord(row) : null;
}

export async function updateSafetyRecordById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    projectId: string | null;
    recordType: SafetyRecordType;
    occurredAt: Date;
    severity: SafetySeverity;
    title: string;
    description: string;
    peopleInvolved: string | null;
    immediateAction: string | null;
    status: SafetyRecordStatus;
    closedAt: Date | null;
    closedByUserId: string | null;
  }>,
  options?: { readonly fromStatuses?: readonly SafetyRecordStatus[] },
): Promise<SafetyRecordRecord | null> {
  const conditions = [
    eq(safetyRecords.id, id),
    eq(safetyRecords.organizationId, organizationId),
  ];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(safetyRecords.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(safetyRecords)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ? mapRecord(row) : null;
}

export async function listCorrectiveActionsForRecord(
  db: DbExecutor,
  organizationId: string,
  safetyRecordId: string,
): Promise<SafetyCorrectiveActionRecord[]> {
  const rows = await db
    .select()
    .from(safetyCorrectiveActions)
    .where(
      and(
        eq(safetyCorrectiveActions.organizationId, organizationId),
        eq(safetyCorrectiveActions.safetyRecordId, safetyRecordId),
      ),
    )
    .orderBy(desc(safetyCorrectiveActions.createdAt));
  return rows.map(mapAction);
}

export async function listCorrectiveActionsForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<SafetyCorrectiveActionRecord[]> {
  const rows = await db
    .select()
    .from(safetyCorrectiveActions)
    .where(eq(safetyCorrectiveActions.organizationId, organizationId))
    .orderBy(desc(safetyCorrectiveActions.createdAt))
    .limit(ORG_LIST_HARD_CAP);
  return rows.map(mapAction);
}

export async function listOverdueCorrectiveActions(
  db: DbExecutor,
  organizationId: string,
  today: string,
): Promise<SafetyCorrectiveActionRecord[]> {
  const rows = await db
    .select()
    .from(safetyCorrectiveActions)
    .where(
      and(
        eq(safetyCorrectiveActions.organizationId, organizationId),
        or(
          eq(safetyCorrectiveActions.status, 'open'),
          eq(safetyCorrectiveActions.status, 'in_progress'),
        ),
        lt(safetyCorrectiveActions.dueDate, today),
      ),
    )
    .orderBy(safetyCorrectiveActions.dueDate)
    .limit(ORG_LIST_HARD_CAP);
  return rows.map(mapAction);
}

export async function insertCorrectiveAction(
  db: DbExecutor,
  values: typeof safetyCorrectiveActions.$inferInsert,
): Promise<SafetyCorrectiveActionRecord> {
  const [row] = await db.insert(safetyCorrectiveActions).values(values).returning();
  if (!row) throw new Error('Failed to insert corrective action');
  return mapAction(row);
}

export async function findCorrectiveActionById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<SafetyCorrectiveActionRecord | null> {
  const [row] = await db
    .select()
    .from(safetyCorrectiveActions)
    .where(
      and(
        eq(safetyCorrectiveActions.id, id),
        eq(safetyCorrectiveActions.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapAction(row) : null;
}

export async function findCorrectiveActionByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<SafetyCorrectiveActionRecord | null> {
  const [row] = await db
    .select()
    .from(safetyCorrectiveActions)
    .where(
      and(
        eq(safetyCorrectiveActions.id, id),
        eq(safetyCorrectiveActions.organizationId, organizationId),
      ),
    )
    .for('update')
    .limit(1);
  return row ? mapAction(row) : null;
}

export async function updateCorrectiveActionById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    ownerUserId: string | null;
    dueDate: string | null;
    status: SafetyActionStatus;
    closedAt: Date | null;
  }>,
  options?: { readonly fromStatuses?: readonly SafetyActionStatus[] },
): Promise<SafetyCorrectiveActionRecord | null> {
  const conditions = [
    eq(safetyCorrectiveActions.id, id),
    eq(safetyCorrectiveActions.organizationId, organizationId),
  ];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(safetyCorrectiveActions.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(safetyCorrectiveActions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ? mapAction(row) : null;
}

export async function findToolboxTalkByRecordId(
  db: DbExecutor,
  organizationId: string,
  safetyRecordId: string,
): Promise<SafetyToolboxTalkRecord | null> {
  const [row] = await db
    .select()
    .from(safetyToolboxTalks)
    .where(
      and(
        eq(safetyToolboxTalks.organizationId, organizationId),
        eq(safetyToolboxTalks.safetyRecordId, safetyRecordId),
      ),
    )
    .limit(1);
  return row ? mapTalk(row) : null;
}

export async function insertToolboxTalk(
  db: DbExecutor,
  values: typeof safetyToolboxTalks.$inferInsert,
): Promise<SafetyToolboxTalkRecord> {
  const [row] = await db.insert(safetyToolboxTalks).values(values).returning();
  if (!row) throw new Error('Failed to insert toolbox talk');
  return mapTalk(row);
}

export async function listAttendeesForTalk(
  db: DbExecutor,
  organizationId: string,
  toolboxTalkId: string,
): Promise<SafetyToolboxAttendeeRecord[]> {
  const rows = await db
    .select()
    .from(safetyToolboxAttendees)
    .where(
      and(
        eq(safetyToolboxAttendees.organizationId, organizationId),
        eq(safetyToolboxAttendees.toolboxTalkId, toolboxTalkId),
      ),
    )
    .orderBy(safetyToolboxAttendees.createdAt);
  return rows.map(mapAttendee);
}

export async function insertToolboxAttendee(
  db: DbExecutor,
  values: typeof safetyToolboxAttendees.$inferInsert,
): Promise<SafetyToolboxAttendeeRecord> {
  const [row] = await db.insert(safetyToolboxAttendees).values(values).returning();
  if (!row) throw new Error('Failed to insert toolbox attendee');
  return mapAttendee(row);
}

export async function findToolboxAttendeeById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<SafetyToolboxAttendeeRecord | null> {
  const [row] = await db
    .select()
    .from(safetyToolboxAttendees)
    .where(
      and(
        eq(safetyToolboxAttendees.id, id),
        eq(safetyToolboxAttendees.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapAttendee(row) : null;
}

export async function findToolboxAttendeeByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<SafetyToolboxAttendeeRecord | null> {
  const [row] = await db
    .select()
    .from(safetyToolboxAttendees)
    .where(
      and(
        eq(safetyToolboxAttendees.id, id),
        eq(safetyToolboxAttendees.organizationId, organizationId),
      ),
    )
    .for('update')
    .limit(1);
  return row ? mapAttendee(row) : null;
}

export async function updateToolboxAttendeeById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{ acknowledgedAt: Date | null }>,
): Promise<SafetyToolboxAttendeeRecord | null> {
  const [row] = await db
    .update(safetyToolboxAttendees)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(safetyToolboxAttendees.id, id),
        eq(safetyToolboxAttendees.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapAttendee(row) : null;
}
