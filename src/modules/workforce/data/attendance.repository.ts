import { and, asc, desc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { attendanceDays, attendanceEvents, employees } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AttendanceDayStatus,
  AttendanceEventSource,
  AttendanceEventType,
} from '../domain/attendance';
import type {
  AttendanceDayListItem,
  AttendanceDayRecord,
  AttendanceEventRecord,
} from '../domain/types';

function mapDay(row: typeof attendanceDays.$inferSelect): AttendanceDayRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    workDate: row.workDate,
    status: row.status as AttendanceDayStatus,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(row: typeof attendanceEvents.$inferSelect): AttendanceEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    attendanceDayId: row.attendanceDayId,
    eventType: row.eventType as AttendanceEventType,
    occurredAt: row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt),
    source: row.source as AttendanceEventSource,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    voidedAt: row.voidedAt
      ? row.voidedAt instanceof Date
        ? row.voidedAt
        : new Date(row.voidedAt)
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertAttendanceDay(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    workDate: string;
    status?: AttendanceDayStatus;
    notes?: string | null;
    createdByUserId?: string | null;
  },
): Promise<AttendanceDayRecord> {
  const [row] = await db
    .insert(attendanceDays)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: input.status ?? 'open',
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  return mapDay(row!);
}

export async function findAttendanceDayById(
  db: DbExecutor,
  organizationId: string,
  dayId: string,
): Promise<AttendanceDayRecord | null> {
  const [row] = await db
    .select()
    .from(attendanceDays)
    .where(and(eq(attendanceDays.id, dayId), eq(attendanceDays.organizationId, organizationId)))
    .limit(1);

  return row ? mapDay(row) : null;
}

export async function findAttendanceDayByEmployeeDate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  workDate: string,
): Promise<AttendanceDayRecord | null> {
  const [row] = await db
    .select()
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.organizationId, organizationId),
        eq(attendanceDays.employeeId, employeeId),
        eq(attendanceDays.workDate, workDate),
        isNull(attendanceDays.archivedAt),
        sql`${attendanceDays.status} <> 'void'`,
      ),
    )
    .limit(1);

  return row ? mapDay(row) : null;
}

export async function updateAttendanceDayStatus(
  db: DbExecutor,
  organizationId: string,
  dayId: string,
  status: AttendanceDayStatus,
): Promise<AttendanceDayRecord | null> {
  const [row] = await db
    .update(attendanceDays)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(attendanceDays.id, dayId), eq(attendanceDays.organizationId, organizationId)))
    .returning();

  return row ? mapDay(row) : null;
}

export async function insertAttendanceEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    attendanceDayId: string;
    eventType: AttendanceEventType;
    occurredAt: Date;
    source?: AttendanceEventSource;
    notes?: string | null;
    createdByUserId?: string | null;
  },
): Promise<AttendanceEventRecord> {
  const [row] = await db
    .insert(attendanceEvents)
    .values({
      organizationId: input.organizationId,
      attendanceDayId: input.attendanceDayId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      source: input.source ?? 'manual',
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();

  return mapEvent(row!);
}

export async function findAttendanceEventById(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<AttendanceEventRecord | null> {
  const [row] = await db
    .select()
    .from(attendanceEvents)
    .where(
      and(eq(attendanceEvents.id, eventId), eq(attendanceEvents.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapEvent(row) : null;
}

export async function listAttendanceEventsForDay(
  db: DbExecutor,
  organizationId: string,
  attendanceDayId: string,
): Promise<AttendanceEventRecord[]> {
  const rows = await db
    .select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.organizationId, organizationId),
        eq(attendanceEvents.attendanceDayId, attendanceDayId),
      ),
    )
    .orderBy(asc(attendanceEvents.occurredAt), asc(attendanceEvents.createdAt));

  return rows.map(mapEvent);
}

export async function voidAttendanceEventById(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
  voidedAt: Date = new Date(),
): Promise<AttendanceEventRecord | null> {
  const [row] = await db
    .update(attendanceEvents)
    .set({ voidedAt, updatedAt: new Date() })
    .where(
      and(
        eq(attendanceEvents.id, eventId),
        eq(attendanceEvents.organizationId, organizationId),
        isNull(attendanceEvents.voidedAt),
      ),
    )
    .returning();

  return row ? mapEvent(row) : null;
}

export interface AttendanceDayFilters {
  readonly employeeId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly status?: AttendanceDayStatus | 'all' | 'active';
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listAttendanceDays(
  db: DbExecutor,
  organizationId: string,
  filters: AttendanceDayFilters = {},
): Promise<AttendanceDayListItem[]> {
  const conditions = [eq(attendanceDays.organizationId, organizationId)];

  if (!filters.includeArchived) {
    conditions.push(isNull(attendanceDays.archivedAt));
  }

  if (filters.employeeId) {
    conditions.push(eq(attendanceDays.employeeId, filters.employeeId));
  }

  if (filters.fromDate) {
    conditions.push(gte(attendanceDays.workDate, filters.fromDate));
  }

  if (filters.toDate) {
    conditions.push(lte(attendanceDays.workDate, filters.toDate));
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'active') {
      // 'active' = all non-void records (open + complete)
      conditions.push(ne(attendanceDays.status, 'void'));
    } else {
      conditions.push(eq(attendanceDays.status, filters.status));
    }
  }

  const hardCap =
    filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
      ? ORG_LIST_EXPORT_CAP
      : ORG_LIST_HARD_CAP;
  const limit = resolveListLimit(filters.limit, { hardCap });
  const offset = resolveListOffset(filters.offset);

  const rows = await db
    .select({
      day: attendanceDays,
      employeeName: employees.name,
      clockInAt: sql<Date | null>`(
        select ae.occurred_at
        from attendance_events ae
        where ae.attendance_day_id = ${attendanceDays.id}
          and ae.organization_id = ${attendanceDays.organizationId}
          and ae.event_type = 'clock_in'
          and ae.voided_at is null
        order by ae.occurred_at asc
        limit 1
      )`,
      clockOutAt: sql<Date | null>`(
        select ae.occurred_at
        from attendance_events ae
        where ae.attendance_day_id = ${attendanceDays.id}
          and ae.organization_id = ${attendanceDays.organizationId}
          and ae.event_type = 'clock_out'
          and ae.voided_at is null
        order by ae.occurred_at desc
        limit 1
      )`,
      eventCount: sql<number>`(
        select count(*)::int
        from attendance_events ae
        where ae.attendance_day_id = ${attendanceDays.id}
          and ae.organization_id = ${attendanceDays.organizationId}
          and ae.voided_at is null
      )`,
    })
    .from(attendanceDays)
    .innerJoin(
      employees,
      and(
        eq(employees.id, attendanceDays.employeeId),
        eq(employees.organizationId, attendanceDays.organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(attendanceDays.workDate), asc(employees.name))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...mapDay(row.day),
    employeeName: row.employeeName,
    clockInAt: row.clockInAt
      ? row.clockInAt instanceof Date
        ? row.clockInAt
        : new Date(row.clockInAt)
      : null,
    clockOutAt: row.clockOutAt
      ? row.clockOutAt instanceof Date
        ? row.clockOutAt
        : new Date(row.clockOutAt)
      : null,
    eventCount: row.eventCount,
  }));
}

/**
 * Returns all non-archived active employees that have NOT reported attendance today
 * (i.e., no non-void attendance_day record for workDate).
 *
 * Strategy: LEFT JOIN attendance_days where date + org match AND status != 'void',
 * then return rows where the join found nothing (day.id IS NULL).
 */
export async function listEmployeesWithoutAttendanceToday(
  db: DbExecutor,
  organizationId: string,
  workDate: string,
): Promise<{ employeeId: string; employeeName: string }[]> {
  const rows = await db
    .select({
      employeeId: employees.id,
      employeeName: employees.name,
      // Will be NULL when no active attendance record exists for today
      attendanceDayId: sql<string | null>`(
        select id from attendance_days ad
        where ad.employee_id = ${employees.id}
          and ad.organization_id = ${organizationId}
          and ad.work_date = ${workDate}
          and ad.archived_at is null
          and ad.status <> 'void'
        limit 1
      )`,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        isNull(employees.archivedAt),
        eq(employees.status, 'active'),
      ),
    )
    .orderBy(asc(employees.name));

  return rows
    .filter((row) => row.attendanceDayId === null)
    .map((row) => ({ employeeId: row.employeeId, employeeName: row.employeeName }));
}
