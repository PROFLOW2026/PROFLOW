import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { employees, timeEntries, timesheets } from '@drizzle/schema';
import {
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  TimeApprovalStatus,
  TimeEntryRecord,
  TimesheetListItem,
  TimesheetRecord,
  TimesheetStatus,
} from '../domain/types';

function mapTimesheet(row: typeof timesheets.$inferSelect): TimesheetRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status as TimesheetStatus,
    submittedByUserId: row.submittedByUserId,
    submittedAt: row.submittedAt,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    managerNote: row.managerNote,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTimeEntry(row: typeof timeEntries.$inferSelect): TimeEntryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    workDate: row.workDate,
    hours: row.hours,
    kind: row.kind,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    phaseId: row.phaseId,
    timeCodeId: row.timeCodeId,
    rateVersionId: row.rateVersionId,
    costAmount: row.costAmount,
    costCurrency: row.costCurrency,
    description: row.description,
    createdByUserId: row.createdByUserId,
    status: (row.status as TimeEntryRecord['status']) ?? 'recorded',
    voidedAt: row.voidedAt ?? null,
    correctsEntryId: row.correctsEntryId ?? null,
    bulkBatchId: row.bulkBatchId ?? null,
    timesheetId: row.timesheetId ?? null,
    approvalStatus: (row.approvalStatus as TimeApprovalStatus) ?? 'draft',
    submittedAt: row.submittedAt ?? null,
    submittedByUserId: row.submittedByUserId ?? null,
    decidedAt: row.decidedAt ?? null,
    decidedByUserId: row.decidedByUserId ?? null,
    managerNote: row.managerNote ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertTimesheet(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    periodStart: string;
    periodEnd: string;
    status?: TimesheetStatus;
  },
): Promise<TimesheetRecord> {
  const [row] = await db
    .insert(timesheets)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: input.status ?? 'draft',
    })
    .returning();

  return mapTimesheet(row!);
}

export async function findTimesheetById(
  db: DbExecutor,
  organizationId: string,
  timesheetId: string,
): Promise<TimesheetRecord | null> {
  const [row] = await db
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.id, timesheetId), eq(timesheets.organizationId, organizationId)))
    .limit(1);

  return row ? mapTimesheet(row) : null;
}

export async function findTimesheetByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  timesheetId: string,
): Promise<TimesheetRecord | null> {
  const [row] = await db
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.id, timesheetId), eq(timesheets.organizationId, organizationId)))
    .for('update')
    .limit(1);

  return row ? mapTimesheet(row) : null;
}

export async function findTimesheetByEmployeePeriod(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  periodStart: string,
): Promise<TimesheetRecord | null> {
  const [row] = await db
    .select()
    .from(timesheets)
    .where(
      and(
        eq(timesheets.organizationId, organizationId),
        eq(timesheets.employeeId, employeeId),
        eq(timesheets.periodStart, periodStart),
        isNull(timesheets.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapTimesheet(row) : null;
}

export async function findTimesheetByEmployeePeriodForUpdate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  periodStart: string,
): Promise<TimesheetRecord | null> {
  const [row] = await db
    .select()
    .from(timesheets)
    .where(
      and(
        eq(timesheets.organizationId, organizationId),
        eq(timesheets.employeeId, employeeId),
        eq(timesheets.periodStart, periodStart),
        isNull(timesheets.archivedAt),
      ),
    )
    .for('update')
    .limit(1);

  return row ? mapTimesheet(row) : null;
}

export interface TimesheetFilters {
  readonly employeeId?: string;
  readonly status?: TimesheetStatus | 'all';
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listTimesheets(
  db: DbExecutor,
  organizationId: string,
  filters: TimesheetFilters = {},
): Promise<TimesheetListItem[]> {
  const conditions = [eq(timesheets.organizationId, organizationId)];

  if (!filters.includeArchived) {
    conditions.push(isNull(timesheets.archivedAt));
  }
  if (filters.employeeId) {
    conditions.push(eq(timesheets.employeeId, filters.employeeId));
  }
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(timesheets.status, filters.status));
  }
  if (filters.fromDate) {
    conditions.push(gte(timesheets.periodEnd, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lte(timesheets.periodStart, filters.toDate));
  }

  const rows = await db
    .select({
      sheet: timesheets,
      employeeName: employees.name,
      entryCount: sql<number>`coalesce(count(${timeEntries.id}) filter (
        where ${timeEntries.status} = 'recorded' and ${timeEntries.archivedAt} is null
      ), 0)::int`,
      totalHours: sql<string>`coalesce(sum(${timeEntries.hours}) filter (
        where ${timeEntries.status} = 'recorded' and ${timeEntries.archivedAt} is null
      ), 0)::text`,
    })
    .from(timesheets)
    .innerJoin(employees, eq(timesheets.employeeId, employees.id))
    .leftJoin(
      timeEntries,
      and(
        eq(timeEntries.timesheetId, timesheets.id),
        eq(timeEntries.organizationId, timesheets.organizationId),
      ),
    )
    .where(and(...conditions))
    .groupBy(timesheets.id, employees.name)
    .orderBy(desc(timesheets.periodStart), desc(timesheets.createdAt))
    .limit(resolveListLimit(filters.limit, { hardCap: ORG_LIST_HARD_CAP }))
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapTimesheet(row.sheet),
    employeeName: row.employeeName,
    entryCount: row.entryCount,
    totalHours: row.totalHours,
  }));
}

export async function updateTimesheetLifecycle(
  db: DbExecutor,
  organizationId: string,
  timesheetId: string,
  patch: {
    status: TimesheetStatus;
    submittedAt?: Date | null;
    submittedByUserId?: string | null;
    decidedAt?: Date | null;
    decidedByUserId?: string | null;
    managerNote?: string | null;
  },
  options?: { readonly fromStatuses?: readonly TimesheetStatus[] },
): Promise<TimesheetRecord | null> {
  const conditions = [
    eq(timesheets.id, timesheetId),
    eq(timesheets.organizationId, organizationId),
  ];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(timesheets.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(timesheets)
    .set({
      status: patch.status,
      submittedAt: patch.submittedAt === undefined ? undefined : patch.submittedAt,
      submittedByUserId:
        patch.submittedByUserId === undefined ? undefined : patch.submittedByUserId,
      decidedAt: patch.decidedAt === undefined ? undefined : patch.decidedAt,
      decidedByUserId: patch.decidedByUserId === undefined ? undefined : patch.decidedByUserId,
      managerNote: patch.managerNote === undefined ? undefined : patch.managerNote,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning();

  return row ? mapTimesheet(row) : null;
}

export async function attachEntriesToTimesheet(
  db: DbExecutor,
  organizationId: string,
  timesheetId: string,
  timeEntryIds: readonly string[],
): Promise<number> {
  if (timeEntryIds.length === 0) return 0;

  const rows = await db
    .update(timeEntries)
    .set({ timesheetId, updatedAt: new Date() })
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        inArray(timeEntries.id, [...timeEntryIds]),
        eq(timeEntries.status, 'recorded'),
        inArray(timeEntries.approvalStatus, ['draft', 'returned', 'submitted']),
      ),
    )
    .returning({ id: timeEntries.id });

  return rows.length;
}

export async function updateEntriesApproval(
  db: DbExecutor,
  organizationId: string,
  input: {
    timeEntryIds: readonly string[];
    fromStatuses: readonly TimeApprovalStatus[];
    approvalStatus: TimeApprovalStatus;
    timesheetId?: string | null;
    submittedAt?: Date | null;
    submittedByUserId?: string | null;
    decidedAt?: Date | null;
    decidedByUserId?: string | null;
    managerNote?: string | null;
  },
): Promise<TimeEntryRecord[]> {
  if (input.timeEntryIds.length === 0) return [];

  const rows = await db
    .update(timeEntries)
    .set({
      approvalStatus: input.approvalStatus,
      timesheetId: input.timesheetId === undefined ? undefined : input.timesheetId,
      submittedAt: input.submittedAt === undefined ? undefined : input.submittedAt,
      submittedByUserId:
        input.submittedByUserId === undefined ? undefined : input.submittedByUserId,
      decidedAt: input.decidedAt === undefined ? undefined : input.decidedAt,
      decidedByUserId: input.decidedByUserId === undefined ? undefined : input.decidedByUserId,
      managerNote: input.managerNote === undefined ? undefined : input.managerNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        inArray(timeEntries.id, [...input.timeEntryIds]),
        eq(timeEntries.status, 'recorded'),
        inArray(timeEntries.approvalStatus, [...input.fromStatuses]),
        isNull(timeEntries.archivedAt),
      ),
    )
    .returning();

  return rows.map(mapTimeEntry);
}

/**
 * Draft / returned hour edits only. Approved recorded history is locked
 * (correctTimeEntry / void remains the correction path).
 */
export async function patchMutableTimeEntry(
  db: DbExecutor,
  organizationId: string,
  timeEntryId: string,
  patch: {
    hours?: string;
    description?: string | null;
    costAmount?: string | null;
    costCurrency?: string | null;
    rateVersionId?: string | null;
  },
): Promise<TimeEntryRecord | null> {
  const [row] = await db
    .update(timeEntries)
    .set({
      hours: patch.hours,
      description: patch.description === undefined ? undefined : patch.description,
      costAmount: patch.costAmount === undefined ? undefined : patch.costAmount,
      costCurrency: patch.costCurrency === undefined ? undefined : patch.costCurrency,
      rateVersionId: patch.rateVersionId === undefined ? undefined : patch.rateVersionId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.id, timeEntryId),
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.status, 'recorded'),
        inArray(timeEntries.approvalStatus, ['draft', 'returned']),
        isNull(timeEntries.archivedAt),
      ),
    )
    .returning();

  return row ? mapTimeEntry(row) : null;
}

export async function listRecordedEntriesInPeriod(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  periodStart: string,
  periodEnd: string,
): Promise<TimeEntryRecord[]> {
  const rows = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.status, 'recorded'),
        isNull(timeEntries.archivedAt),
        gte(timeEntries.workDate, periodStart),
        lte(timeEntries.workDate, periodEnd),
      ),
    )
    .orderBy(timeEntries.workDate, timeEntries.createdAt);

  return rows.map(mapTimeEntry);
}
