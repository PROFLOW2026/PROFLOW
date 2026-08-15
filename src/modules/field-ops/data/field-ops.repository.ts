import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { dailyLogs, employees, inspections, punchListItems } from '@drizzle/schema';
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
  DailyLogStatus,
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
    status: (row.status as DailyLogStatus) ?? 'draft',
    workPerformed: row.workPerformed,
    delays: row.delays,
    incidents: row.incidents,
    safetyNotes: row.safetyNotes,
    visitorNotes: row.visitorNotes,
    managerNotes: row.managerNotes,
    correctionNotes: row.correctionNotes ?? null,
    linkedSafetyRecordId: row.linkedSafetyRecordId ?? null,
    workersOnSite: row.workersOnSite,
    subcontractorsOnSite: row.subcontractorsOnSite,
    equipmentOnSite: row.equipmentOnSite,
    deliveries: row.deliveries,
    submittedAt: row.submittedAt,
    submittedByUserId: row.submittedByUserId,
    finalizedAt: row.finalizedAt,
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
    assigneeEmployeeId: row.assigneeEmployeeId ?? null,
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
    inspectorEmployeeId: row.inspectorEmployeeId ?? null,
    formTemplateId: row.formTemplateId ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface DailyLogListFilters {
  readonly projectId?: string;
  readonly status?: DailyLogStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listDailyLogs(
  db: DbExecutor,
  organizationId: string,
  projectIdOrFilters?: string | DailyLogListFilters,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<DailyLogRecord[]> {
  const filtersObj: DailyLogListFilters =
    typeof projectIdOrFilters === 'string'
      ? { projectId: projectIdOrFilters, ...options }
      : { ...(projectIdOrFilters ?? {}), ...options };
  const filters = [eq(dailyLogs.organizationId, organizationId), isNull(dailyLogs.archivedAt)];
  if (filtersObj.projectId) filters.push(eq(dailyLogs.projectId, filtersObj.projectId));
  if (filtersObj.status) filters.push(eq(dailyLogs.status, filtersObj.status));
  const rows = await db
    .select()
    .from(dailyLogs)
    .where(and(...filters))
    .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.createdAt))
    .limit(
      resolveListLimit(filtersObj.limit, {
        hardCap:
          filtersObj.limit != null && filtersObj.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filtersObj.offset));
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

export async function findActiveDailyLogByProjectDate(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  logDate: string,
  excludeId?: string,
): Promise<DailyLogRecord | null> {
  const filters = [
    eq(dailyLogs.organizationId, organizationId),
    eq(dailyLogs.projectId, projectId),
    eq(dailyLogs.logDate, logDate),
    isNull(dailyLogs.archivedAt),
  ];
  const rows = await db
    .select()
    .from(dailyLogs)
    .where(and(...filters))
    .limit(8);
  const match = excludeId ? rows.find((row) => row.id !== excludeId) : rows[0];
  return match ? mapDailyLog(match) : null;
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
    status: DailyLogStatus;
    workPerformed: string | null;
    delays: string | null;
    incidents: string | null;
    safetyNotes: string | null;
    visitorNotes: string | null;
    managerNotes: string | null;
    correctionNotes: string | null;
    linkedSafetyRecordId: string | null;
    workersOnSite: string | null;
    subcontractorsOnSite: string | null;
    equipmentOnSite: string | null;
    deliveries: string | null;
    submittedAt: Date | null;
    submittedByUserId: string | null;
    finalizedAt: Date | null;
  }>,
  options?: { readonly fromStatuses?: readonly DailyLogStatus[] },
): Promise<DailyLogRecord | null> {
  const conditions = [eq(dailyLogs.id, id), eq(dailyLogs.organizationId, organizationId)];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(dailyLogs.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(dailyLogs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
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

export async function findDailyLogByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<DailyLogRecord | null> {
  const [row] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.id, id), eq(dailyLogs.organizationId, organizationId)))
    .for('update')
    .limit(1);
  return row ? mapDailyLog(row) : null;
}

export async function findDailyLogByLinkedSafetyRecordId(
  db: DbExecutor,
  organizationId: string,
  safetyRecordId: string,
): Promise<DailyLogRecord | null> {
  const [row] = await db
    .select()
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.organizationId, organizationId),
        eq(dailyLogs.linkedSafetyRecordId, safetyRecordId),
        isNull(dailyLogs.archivedAt),
      ),
    )
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

export async function findPunchListItemByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<PunchListItemRecord | null> {
  const [row] = await db
    .select()
    .from(punchListItems)
    .where(and(eq(punchListItems.id, id), eq(punchListItems.organizationId, organizationId)))
    .for('update')
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
    assigneeEmployeeId: string | null;
    workPackageId: string | null;
    closedAt: Date | null;
  }>,
  options?: { readonly fromStatuses?: readonly PunchStatus[] },
): Promise<PunchListItemRecord | null> {
  const conditions = [eq(punchListItems.id, id), eq(punchListItems.organizationId, organizationId)];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(punchListItems.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(punchListItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ? mapPunch(row) : null;
}

export async function listActiveEmployeeNameOptions(
  db: DbExecutor,
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), isNull(employees.archivedAt)))
    .orderBy(asc(employees.name));
  return rows;
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

export async function findInspectionByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<InspectionRecord | null> {
  const [row] = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.id, id), eq(inspections.organizationId, organizationId)))
    .for('update')
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
    inspectorEmployeeId: string | null;
    formTemplateId: string | null;
  }>,
  options?: { readonly fromStatuses?: readonly InspectionStatus[] },
): Promise<InspectionRecord | null> {
  const conditions = [eq(inspections.id, id), eq(inspections.organizationId, organizationId)];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(inspections.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(inspections)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ? mapInspection(row) : null;
}
