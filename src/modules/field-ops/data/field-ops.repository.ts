import { and, desc, eq, isNull } from 'drizzle-orm';
import { dailyLogs, inspections, punchListItems } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { unpackWorkforceAndBlockers } from '../domain/daily-log-notes';
import type {
  DailyLogRecord,
  InspectionRecord,
  InspectionStatus,
  PunchListItemRecord,
  PunchPriority,
  PunchStatus,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapDailyLog(row: typeof dailyLogs.$inferSelect): DailyLogRecord {
  const notes = unpackWorkforceAndBlockers(row.workforceNotes);
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    logDate: asDateString(row.logDate) ?? row.logDate,
    weather: row.weather,
    summary: row.summary,
    workforceNotes: notes.workforceNotes,
    blockers: notes.blockers,
    createdBy: row.createdBy,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPunch(row: typeof punchListItems.$inferSelect): PunchListItemRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    title: row.title,
    description: row.description,
    status: row.status as PunchStatus,
    priority: row.priority as PunchPriority,
    location: row.location,
    dueDate: asDateString(row.dueDate),
    closedAt: row.closedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapInspection(row: typeof inspections.$inferSelect): InspectionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    title: row.title,
    kind: row.kind,
    status: row.status as InspectionStatus,
    scheduledOn: asDateString(row.scheduledOn),
    completedOn: asDateString(row.completedOn),
    result: row.result,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listDailyLogs(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<DailyLogRecord[]> {
  const filters = [eq(dailyLogs.organizationId, organizationId), isNull(dailyLogs.archivedAt)];
  if (projectId) filters.push(eq(dailyLogs.projectId, projectId));
  const rows = await db
    .select()
    .from(dailyLogs)
    .where(and(...filters))
    .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
  return rows.map(mapDailyLog);
}

export async function insertDailyLog(
  db: DbExecutor,
  values: typeof dailyLogs.$inferInsert,
): Promise<DailyLogRecord> {
  const [row] = await db.insert(dailyLogs).values(values).returning();
  if (!row) throw new Error('Failed to insert daily log');
  return mapDailyLog(row);
}

export async function updateDailyLogById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    workPackageId: string | null;
    logDate: string;
    weather: string | null;
    summary: string;
    workforceNotes: string | null;
  }>,
): Promise<DailyLogRecord | null> {
  const [row] = await db
    .update(dailyLogs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(dailyLogs.id, id), eq(dailyLogs.organizationId, organizationId)))
    .returning();
  return row ? mapDailyLog(row) : null;
}

export async function findDailyLogById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<DailyLogRecord | null> {
  const [row] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.id, id), eq(dailyLogs.organizationId, organizationId)))
    .limit(1);
  return row ? mapDailyLog(row) : null;
}

export interface PunchListFilters {
  readonly projectId?: string;
  readonly status?: PunchStatus;
  readonly priority?: PunchPriority;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listPunchListItems(
  db: DbExecutor,
  organizationId: string,
  filtersInput: string | PunchListFilters = {},
): Promise<PunchListItemRecord[]> {
  const filtersObj: PunchListFilters =
    typeof filtersInput === 'string' ? { projectId: filtersInput } : filtersInput;
  const filters = [
    eq(punchListItems.organizationId, organizationId),
    isNull(punchListItems.archivedAt),
  ];
  if (filtersObj.projectId) filters.push(eq(punchListItems.projectId, filtersObj.projectId));
  if (filtersObj.status) filters.push(eq(punchListItems.status, filtersObj.status));
  if (filtersObj.priority) filters.push(eq(punchListItems.priority, filtersObj.priority));
  const rows = await db
    .select()
    .from(punchListItems)
    .where(and(...filters))
    .orderBy(desc(punchListItems.createdAt))
    .limit(
      resolveListLimit(filtersObj.limit, {
        hardCap:
          filtersObj.limit != null && filtersObj.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filtersObj.offset));
  return rows.map(mapPunch);
}

export async function insertPunchListItem(
  db: DbExecutor,
  values: typeof punchListItems.$inferInsert,
): Promise<PunchListItemRecord> {
  const [row] = await db.insert(punchListItems).values(values).returning();
  if (!row) throw new Error('Failed to insert punch list item');
  return mapPunch(row);
}

export async function findPunchListItemById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<PunchListItemRecord | null> {
  const [row] = await db
    .select()
    .from(punchListItems)
    .where(and(eq(punchListItems.id, id), eq(punchListItems.organizationId, organizationId)))
    .limit(1);
  return row ? mapPunch(row) : null;
}

export async function updatePunchListItemById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    status: PunchStatus;
    priority: PunchPriority;
    location: string | null;
    dueDate: string | null;
    workPackageId: string | null;
    closedAt: Date | null;
  }>,
): Promise<PunchListItemRecord | null> {
  const [row] = await db
    .update(punchListItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(punchListItems.id, id), eq(punchListItems.organizationId, organizationId)))
    .returning();
  return row ? mapPunch(row) : null;
}

export interface InspectionListFilters {
  readonly projectId?: string;
  readonly status?: InspectionStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listInspections(
  db: DbExecutor,
  organizationId: string,
  filtersInput: string | InspectionListFilters = {},
): Promise<InspectionRecord[]> {
  const filtersObj: InspectionListFilters =
    typeof filtersInput === 'string' ? { projectId: filtersInput } : filtersInput;
  const filters = [eq(inspections.organizationId, organizationId), isNull(inspections.archivedAt)];
  if (filtersObj.projectId) filters.push(eq(inspections.projectId, filtersObj.projectId));
  if (filtersObj.status) filters.push(eq(inspections.status, filtersObj.status));
  const rows = await db
    .select()
    .from(inspections)
    .where(and(...filters))
    .orderBy(desc(inspections.createdAt))
    .limit(
      resolveListLimit(filtersObj.limit, {
        hardCap:
          filtersObj.limit != null && filtersObj.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filtersObj.offset));
  return rows.map(mapInspection);
}

export async function insertInspection(
  db: DbExecutor,
  values: typeof inspections.$inferInsert,
): Promise<InspectionRecord> {
  const [row] = await db.insert(inspections).values(values).returning();
  if (!row) throw new Error('Failed to insert inspection');
  return mapInspection(row);
}

export async function findInspectionById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InspectionRecord | null> {
  const [row] = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.id, id), eq(inspections.organizationId, organizationId)))
    .limit(1);
  return row ? mapInspection(row) : null;
}

export async function updateInspectionById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<{
    title: string;
    kind: string;
    status: InspectionStatus;
    scheduledOn: string | null;
    completedOn: string | null;
    result: string | null;
    notes: string | null;
    workPackageId: string | null;
  }>,
): Promise<InspectionRecord | null> {
  const [row] = await db
    .update(inspections)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(inspections.id, id), eq(inspections.organizationId, organizationId)))
    .returning();
  return row ? mapInspection(row) : null;
}
