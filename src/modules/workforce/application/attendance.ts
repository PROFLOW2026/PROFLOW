import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertAnyPermission,
  assertPermission,
  hasPermission,
} from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  canClockIn,
  canClockOut,
  canEndBreak,
  canStartBreak,
  deriveAttendanceDayStatus,
  listActiveAttendanceEvents,
  resolveClockPresenceState,
  type AttendanceEventSource,
  type ClockPresenceState,
} from '../domain/attendance';
import { expandWorkDatesInRange } from '../domain/bulk-time-expand';
import type {
  AttendanceDayDetail,
  AttendanceDayListItem,
  AttendanceDayRecord,
  AttendanceEventRecord,
} from '../domain/types';
import { findEmployeeById, findEmployeeByUserId } from '../data/employees.repository';
import {
  findAttendanceDayByEmployeeDate,
  findAttendanceDayById,
  findAttendanceEventById,
  insertAttendanceDay,
  insertAttendanceEvent,
  listAttendanceDays,
  listAttendanceEventsForDay,
  listEmployeesWithoutAttendanceToday as listEmployeesWithoutAttendanceTodayDb,
  updateAttendanceDayStatus,
  voidAttendanceEventById,
} from '../data/attendance.repository';
import {
  attendanceFiltersSchema,
  clockAttendanceSchema,
  manualAttendanceEventSchema,
  manualAttendanceWorkdayRangeSchema,
  replaceAttendanceEventSchema,
  voidAttendanceDaySchema,
  voidAttendanceEventSchema,
  type AttendanceFiltersInput,
  type ClockAttendanceInput,
  type ManualAttendanceEventInput,
  type ManualAttendanceWorkdayRangeInput,
  type ReplaceAttendanceEventInput,
  type VoidAttendanceDayInput,
  type VoidAttendanceEventInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } } },
  rawInput: unknown,
): T {
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

function canManageAttendance(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);
}

function canReadOrgAttendance(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
    hasPermission(context, PERMISSIONS.ATTENDANCE_READ)
  );
}

function canUseSelfAttendance(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
}

async function requireLinkedEmployee(context: OrgContext) {
  const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
  if (!linked || linked.archivedAt) {
    throw new DomainRuleError(
      'Signed-in user is not linked to an employee',
      'workforce.errors.noLinkedEmployee',
    );
  }
  return linked;
}

/**
 * Self-only users may only touch their linked employee.
 * Manage/read may act on any employee (mutations still need manage).
 */
async function resolveTargetEmployeeId(
  context: OrgContext,
  requestedEmployeeId: string | undefined,
  options: { readonly requireManageForOthers?: boolean } = {},
): Promise<string> {
  const manage = canManageAttendance(context);
  const self = canUseSelfAttendance(context);

  if (!manage && !self && !canReadOrgAttendance(context)) {
    assertAnyPermission(context, [
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ATTENDANCE_SELF,
      PERMISSIONS.ATTENDANCE_READ,
    ]);
  }

  if (manage) {
    if (requestedEmployeeId) return requestedEmployeeId;
    const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
    if (linked) return linked.id;
    throw new ValidationError([{ path: 'employeeId', message: 'Employee required' }]);
  }

  // Self-only (or self + read without manage for mutations)
  if (options.requireManageForOthers && !manage) {
    const linked = await requireLinkedEmployee(context);
    if (requestedEmployeeId && requestedEmployeeId !== linked.id) {
      throw new DomainRuleError(
        'Attendance self scope is limited to the linked employee',
        'workforce.errors.attendanceSelfScope',
      );
    }
    return linked.id;
  }

  if (self) {
    const linked = await requireLinkedEmployee(context);
    if (requestedEmployeeId && requestedEmployeeId !== linked.id) {
      throw new DomainRuleError(
        'Attendance self scope is limited to the linked employee',
        'workforce.errors.attendanceSelfScope',
      );
    }
    return linked.id;
  }

  if (requestedEmployeeId) return requestedEmployeeId;
  throw new ValidationError([{ path: 'employeeId', message: 'Employee required' }]);
}

async function refreshDayStatus(
  context: OrgContext,
  day: AttendanceDayRecord,
): Promise<AttendanceDayRecord> {
  if (day.status === 'void') return day;
  const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);
  const next = deriveAttendanceDayStatus(events, day.status);
  if (next === day.status) return day;
  const updated = await updateAttendanceDayStatus(
    context.db,
    context.organizationId,
    day.id,
    next,
  );
  return updated ?? day;
}

async function ensureOpenDay(
  context: OrgContext,
  employeeId: string,
  workDate: string,
): Promise<AttendanceDayRecord> {
  const existing = await findAttendanceDayByEmployeeDate(
    context.db,
    context.organizationId,
    employeeId,
    workDate,
  );
  if (existing) return existing;

  return insertAttendanceDay(context.db, {
    organizationId: context.organizationId,
    employeeId,
    workDate,
    status: 'open',
    createdByUserId: context.userId,
  });
}

function inferEventSource(context: OrgContext, explicit?: AttendanceEventSource): AttendanceEventSource {
  if (explicit) return explicit;
  if (canManageAttendance(context) && !canUseSelfAttendance(context)) return 'manager';
  if (canUseSelfAttendance(context) && !canManageAttendance(context)) return 'self';
  return canManageAttendance(context) ? 'manager' : 'self';
}

export interface AttendanceClockSurface {
  readonly employeeId: string | null;
  readonly employeeName: string | null;
  readonly workDate: string;
  readonly day: AttendanceDayRecord | null;
  readonly events: readonly AttendanceEventRecord[];
  readonly presence: ClockPresenceState;
  readonly canClockIn: boolean;
  readonly canClockOut: boolean;
  readonly canBreakStart: boolean;
  readonly canBreakEnd: boolean;
  readonly canManage: boolean;
}

/** Worker-friendly clock surface for today (org TZ). Optional - unused orgs see empty. */
export async function getAttendanceClockSurface(
  context: OrgContext,
): Promise<AttendanceClockSurface> {
  assertAnyPermission(context, [
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SELF,
  ]);

  const workDate = todayInTimeZone(context.organization.timezone);
  const manage = canManageAttendance(context);

  let employeeId: string | null = null;
  let employeeName: string | null = null;

  if (canUseSelfAttendance(context) || manage) {
    const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
    if (linked) {
      employeeId = linked.id;
      employeeName = linked.name;
    }
  }

  if (!employeeId) {
    return {
      employeeId: null,
      employeeName: null,
      workDate,
      day: null,
      events: [],
      presence: 'absent',
      canClockIn: false,
      canClockOut: false,
      canBreakStart: false,
      canBreakEnd: false,
      canManage: manage,
    };
  }

  const day = await findAttendanceDayByEmployeeDate(
    context.db,
    context.organizationId,
    employeeId,
    workDate,
  );
  const events = day
    ? await listAttendanceEventsForDay(context.db, context.organizationId, day.id)
    : [];
  const presence = resolveClockPresenceState(events);

  return {
    employeeId,
    employeeName,
    workDate,
    day,
    events,
    presence,
    canClockIn: canClockIn(presence),
    canClockOut: canClockOut(presence),
    canBreakStart: canStartBreak(presence),
    canBreakEnd: canEndBreak(presence),
    canManage: manage,
  };
}

export async function listAttendanceDaysForOrg(
  context: OrgContext,
  filters: AttendanceFiltersInput = {},
): Promise<AttendanceDayListItem[]> {
  assertAnyPermission(context, [
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SELF,
  ]);

  const parsed = parseOrThrow(attendanceFiltersSchema, filters);
  let scopedEmployeeId = parsed.employeeId;
  if (!canReadOrgAttendance(context)) {
    const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
    if (!linked || linked.archivedAt) {
      // Self-only user without a linked employee: empty list, not a hard error.
      return [];
    }
    if (parsed.employeeId && parsed.employeeId !== linked.id) {
      throw new DomainRuleError(
        'Attendance self scope is limited to the linked employee',
        'workforce.errors.attendanceSelfScope',
      );
    }
    scopedEmployeeId = linked.id;
  }

  return listAttendanceDays(context.db, context.organizationId, {
    employeeId: scopedEmployeeId,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
    // Default: exclude void records so the owner sees only active attendance
    status: parsed.status ?? 'active',
  });
}

export async function getAttendanceDayDetail(
  context: OrgContext,
  dayId: string,
): Promise<AttendanceDayDetail> {
  assertAnyPermission(context, [
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SELF,
  ]);

  const day = await findAttendanceDayById(context.db, context.organizationId, dayId);
  if (!day || day.archivedAt) throw new NotFoundError('Attendance day');

  if (!canReadOrgAttendance(context)) {
    const linked = await requireLinkedEmployee(context);
    if (day.employeeId !== linked.id) {
      throw new DomainRuleError(
        'Attendance self scope is limited to the linked employee',
        'workforce.errors.attendanceSelfScope',
      );
    }
  }

  const employee = await findEmployeeById(context.db, context.organizationId, day.employeeId);
  const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);

  return {
    ...day,
    employeeName: employee?.name ?? '-',
    events,
    presence: resolveClockPresenceState(events),
  };
}

/**
 * Clock in / clock out for today (or explicit workDate for managers).
 * Never creates time entries or labor cost.
 */
export async function clockAttendance(
  context: OrgContext,
  rawInput: ClockAttendanceInput,
): Promise<AttendanceEventRecord> {
  assertAnyPermission(context, [PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ATTENDANCE_SELF]);

  const input = parseOrThrow(clockAttendanceSchema, rawInput);
  const employeeId = await resolveTargetEmployeeId(context, input.employeeId, {
    requireManageForOthers: true,
  });

  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  const workDate =
    input.workDate ?? todayInTimeZone(context.organization.timezone);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new ValidationError([{ path: 'occurredAt', message: 'Invalid timestamp' }]);
  }

  const day = await ensureOpenDay(context, employeeId, workDate);
  if (day.status === 'void') {
    throw new DomainRuleError('Attendance day is void', 'workforce.errors.attendanceDayVoid');
  }

  const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);
  const presence = resolveClockPresenceState(events);

  if (input.eventType === 'clock_in' && !canClockIn(presence)) {
    throw new DomainRuleError('Already clocked in', 'workforce.errors.alreadyClockedIn');
  }
  if (input.eventType === 'clock_out' && !canClockOut(presence)) {
    throw new DomainRuleError('Not clocked in', 'workforce.errors.notClockedIn');
  }
  if (input.eventType === 'break_start' && !canStartBreak(presence)) {
    throw new DomainRuleError('Not clocked in', 'workforce.errors.breakStartInvalid');
  }
  if (input.eventType === 'break_end' && !canEndBreak(presence)) {
    throw new DomainRuleError('Not on break', 'workforce.errors.breakEndInvalid');
  }

  const source = inferEventSource(context, input.source);
  const event = await insertAttendanceEvent(context.db, {
    organizationId: context.organizationId,
    attendanceDayId: day.id,
    eventType: input.eventType,
    occurredAt,
    source,
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  await refreshDayStatus(context, day);
  await noteModuleUsage(context.db, context.organizationId, 'workforce');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_CLOCKED,
    entityType: 'attendance_event',
    entityId: event.id,
    after: {
      attendanceDayId: day.id,
      employeeId,
      workDate,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      source: event.source,
    },
  });

  return event;
}

/** Manager manual entry (any allowed event type) - still not labor Actual. */
export async function recordManualAttendanceEvent(
  context: OrgContext,
  rawInput: ManualAttendanceEventInput,
): Promise<AttendanceEventRecord> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const input = parseOrThrow(manualAttendanceEventSchema, rawInput);
  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new ValidationError([{ path: 'occurredAt', message: 'Invalid timestamp' }]);
  }

  const day = await ensureOpenDay(context, input.employeeId, input.workDate);
  if (day.status === 'void') {
    throw new DomainRuleError('Attendance day is void', 'workforce.errors.attendanceDayVoid');
  }

  if (input.eventType === 'clock_in' || input.eventType === 'clock_out') {
    const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);
    const presence = resolveClockPresenceState(events);
    if (input.eventType === 'clock_in' && !canClockIn(presence)) {
      throw new DomainRuleError('Already clocked in', 'workforce.errors.alreadyClockedIn');
    }
    if (input.eventType === 'clock_out' && !canClockOut(presence)) {
      throw new DomainRuleError('Not clocked in', 'workforce.errors.notClockedIn');
    }
  }

  const event = await insertAttendanceEvent(context.db, {
    organizationId: context.organizationId,
    attendanceDayId: day.id,
    eventType: input.eventType,
    occurredAt,
    source: input.source ?? 'manual',
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  await refreshDayStatus(context, day);
  await noteModuleUsage(context.db, context.organizationId, 'workforce');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_EVENT_RECORDED,
    entityType: 'attendance_event',
    entityId: event.id,
    after: {
      attendanceDayId: day.id,
      employeeId: input.employeeId,
      workDate: input.workDate,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      source: event.source,
    },
  });

  return event;
}

/** Soft-void a single event; day status is recomputed. */
export async function voidAttendanceEvent(
  context: OrgContext,
  rawInput: VoidAttendanceEventInput,
): Promise<AttendanceEventRecord> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const input = parseOrThrow(voidAttendanceEventSchema, rawInput);
  const existing = await findAttendanceEventById(context.db, context.organizationId, input.eventId);
  if (!existing) throw new NotFoundError('Attendance event');
  if (existing.voidedAt) {
    throw new DomainRuleError('Event already voided', 'workforce.errors.attendanceEventVoided');
  }

  const voided = await voidAttendanceEventById(
    context.db,
    context.organizationId,
    input.eventId,
  );
  if (!voided) throw new NotFoundError('Attendance event');

  const day = await findAttendanceDayById(
    context.db,
    context.organizationId,
    existing.attendanceDayId,
  );
  if (day) await refreshDayStatus(context, day);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_EVENT_VOIDED,
    entityType: 'attendance_event',
    entityId: voided.id,
    before: {
      eventType: existing.eventType,
      occurredAt: existing.occurredAt.toISOString(),
      notes: existing.notes,
    },
    after: {
      voidedAt: voided.voidedAt?.toISOString() ?? null,
      correctionNotes: input.notes ?? null,
    },
  });

  return voided;
}

/**
 * Retrospective correction: void the original event and insert a replacement.
 * Does not rewrite history in place.
 */
export async function replaceAttendanceEvent(
  context: OrgContext,
  rawInput: ReplaceAttendanceEventInput,
): Promise<AttendanceEventRecord> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const input = parseOrThrow(replaceAttendanceEventSchema, rawInput);
  const existing = await findAttendanceEventById(context.db, context.organizationId, input.eventId);
  if (!existing) throw new NotFoundError('Attendance event');
  if (existing.voidedAt) {
    throw new DomainRuleError('Event already voided', 'workforce.errors.attendanceEventVoided');
  }

  const day = await findAttendanceDayById(
    context.db,
    context.organizationId,
    existing.attendanceDayId,
  );
  if (!day || day.status === 'void') {
    throw new DomainRuleError('Attendance day is void', 'workforce.errors.attendanceDayVoid');
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : existing.occurredAt;
  if (Number.isNaN(occurredAt.getTime())) {
    throw new ValidationError([{ path: 'occurredAt', message: 'Invalid timestamp' }]);
  }

  const voided = await voidAttendanceEventById(
    context.db,
    context.organizationId,
    existing.id,
  );
  if (!voided) throw new NotFoundError('Attendance event');

  const replacementType = input.eventType ?? existing.eventType;

  // Validate clock transitions against remaining + replacement as if applied last.
  if (replacementType === 'clock_in' || replacementType === 'clock_out') {
    const remaining = await listAttendanceEventsForDay(
      context.db,
      context.organizationId,
      day.id,
    );
    const presence = resolveClockPresenceState(remaining);
    if (replacementType === 'clock_in' && !canClockIn(presence)) {
      // Roll forward would fail - still allow manager replace when only this type makes sense
      // after void; if still invalid, reject.
      throw new DomainRuleError('Already clocked in', 'workforce.errors.alreadyClockedIn');
    }
    if (replacementType === 'clock_out' && !canClockOut(presence)) {
      throw new DomainRuleError('Not clocked in', 'workforce.errors.notClockedIn');
    }
  }

  const replacement = await insertAttendanceEvent(context.db, {
    organizationId: context.organizationId,
    attendanceDayId: day.id,
    eventType: replacementType,
    occurredAt,
    source: 'manager',
    notes: input.notes ?? existing.notes,
    createdByUserId: context.userId,
  });

  await refreshDayStatus(context, day);
  await noteModuleUsage(context.db, context.organizationId, 'workforce');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_EVENT_REPLACED,
    entityType: 'attendance_event',
    entityId: replacement.id,
    before: {
      voidedEventId: existing.id,
      eventType: existing.eventType,
      occurredAt: existing.occurredAt.toISOString(),
    },
    after: {
      eventType: replacement.eventType,
      occurredAt: replacement.occurredAt.toISOString(),
      notes: replacement.notes,
    },
  });

  return replacement;
}

export async function voidAttendanceDay(
  context: OrgContext,
  rawInput: VoidAttendanceDayInput,
): Promise<AttendanceDayRecord> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const input = parseOrThrow(voidAttendanceDaySchema, rawInput);
  const day = await findAttendanceDayById(context.db, context.organizationId, input.dayId);
  if (!day || day.archivedAt) throw new NotFoundError('Attendance day');
  if (day.status === 'void') {
    throw new DomainRuleError('Attendance day already void', 'workforce.errors.attendanceDayVoid');
  }

  const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);
  for (const event of events) {
    if (!event.voidedAt) {
      await voidAttendanceEventById(context.db, context.organizationId, event.id);
    }
  }

  const updated = await updateAttendanceDayStatus(
    context.db,
    context.organizationId,
    day.id,
    'void',
  );
  if (!updated) throw new NotFoundError('Attendance day');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_DAY_VOIDED,
    entityType: 'attendance_day',
    entityId: day.id,
    before: { status: day.status, employeeId: day.employeeId, workDate: day.workDate },
    after: { status: 'void', notes: input.notes ?? null },
  });

  return updated;
}

function localWallTimeToDate(workDate: string, timeOfDay: string): Date {
  const normalized = timeOfDay.length === 5 ? `${timeOfDay}:00` : timeOfDay;
  const parsed = new Date(`${workDate}T${normalized}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError([{ path: 'clockInTime', message: 'Invalid timestamp' }]);
  }
  return parsed;
}

function expandAttendanceRangeDates(input: {
  readonly fromDate: string;
  readonly toDate: string;
  readonly weekdays: readonly number[];
}): string[] {
  try {
    return [...expandWorkDatesInRange(input)];
  } catch {
    throw new DomainRuleError('Invalid attendance range', 'workforce.errors.invalidBulkRange');
  }
}

export type AttendanceRangeDayKind = 'new' | 'existing' | 'void';

export interface AttendanceWorkdayRangePreview {
  readonly dates: readonly string[];
  readonly newCount: number;
  readonly existingCount: number;
  readonly voidCount: number;
  readonly kindsByDate: Readonly<Record<string, AttendanceRangeDayKind>>;
}

export interface AttendanceWorkdayRangeResult {
  readonly dates: readonly string[];
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly skippedExistingCount: number;
  readonly skippedVoidCount: number;
  readonly createdDates: readonly string[];
  readonly updatedDates: readonly string[];
  readonly skippedExistingDates: readonly string[];
  readonly skippedVoidDates: readonly string[];
  /** Project time created when Owner selected a project (0 when general/office). */
  readonly projectTimeCreatedCount: number;
  readonly projectTimeSkippedDuplicateCount: number;
  readonly projectTimeApprovedCount: number;
  readonly projectTimePendingCount: number;
  readonly projectTimeVoidedDuplicateCount: number;
  readonly projectTimeVoidedPriorWorkCount: number;
  readonly projectTimeWarningKey?: string | null;
}

export interface AttendanceOverwriteSummary {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly dayCount: number;
  readonly existingCount: number;
  readonly newCount: number;
  readonly clockInTime: string;
  readonly clockOutTime: string;
  readonly workScope: 'general' | 'project';
  readonly projectId: string | null;
}

export type AttendanceWorkdayWriteOutcome =
  | {
      readonly status: 'needs_overwrite_approval';
      readonly summary: AttendanceOverwriteSummary;
    }
  | {
      readonly status: 'applied';
      readonly result: AttendanceWorkdayRangeResult;
    };

async function classifyAttendanceRangeDates(
  context: OrgContext,
  employeeId: string,
  dates: readonly string[],
): Promise<AttendanceWorkdayRangePreview> {
  if (dates.length === 0) {
    return { dates: [], newCount: 0, existingCount: 0, voidCount: 0, kindsByDate: {} };
  }

  const fromDate = dates[0]!;
  const toDate = dates[dates.length - 1]!;
  const listed = await listAttendanceDays(context.db, context.organizationId, {
    employeeId,
    fromDate,
    toDate,
    limit: 200,
  });
  const byDate = new Map(listed.map((row) => [row.workDate, row]));

  const kindsByDate: Record<string, AttendanceRangeDayKind> = {};
  let newCount = 0;
  let existingCount = 0;
  let voidCount = 0;

  for (const workDate of dates) {
    const day = byDate.get(workDate);
    if (!day) {
      kindsByDate[workDate] = 'new';
      newCount += 1;
      continue;
    }
    if (day.status === 'void') {
      kindsByDate[workDate] = 'void';
      voidCount += 1;
      continue;
    }
    const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);
    const active = listActiveAttendanceEvents(events);
    if (active.length > 0) {
      kindsByDate[workDate] = 'existing';
      existingCount += 1;
    } else {
      kindsByDate[workDate] = 'new';
      newCount += 1;
    }
  }

  return { dates, newCount, existingCount, voidCount, kindsByDate };
}

/**
 * Preview which work dates a range template would touch (no writes).
 * Existing = day with active events; void days are reported separately.
 */
export async function previewManualAttendanceWorkdayRange(
  context: OrgContext,
  rawInput: Pick<
    ManualAttendanceWorkdayRangeInput,
    'employeeId' | 'fromDate' | 'toDate' | 'weekdays'
  >,
): Promise<AttendanceWorkdayRangePreview> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const employeeId = rawInput.employeeId;
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  const dates = expandAttendanceRangeDates({
    fromDate: rawInput.fromDate,
    toDate: rawInput.toDate,
    weekdays: rawInput.weekdays,
  });
  if (dates.length === 0) {
    throw new DomainRuleError('Empty attendance range', 'workforce.errors.emptyBulk');
  }

  return classifyAttendanceRangeDates(context, employeeId, dates);
}

async function voidActiveEventsForCorrection(
  context: OrgContext,
  day: AttendanceDayRecord,
  notes: string | null,
): Promise<void> {
  const events = await listAttendanceEventsForDay(context.db, context.organizationId, day.id);
  for (const event of events) {
    if (event.voidedAt) continue;
    const voided = await voidAttendanceEventById(context.db, context.organizationId, event.id);
    if (!voided) continue;
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.ATTENDANCE_EVENT_VOIDED,
      entityType: 'attendance_event',
      entityId: voided.id,
      before: {
        eventType: event.eventType,
        occurredAt: event.occurredAt.toISOString(),
        notes: event.notes,
      },
      after: {
        voidedAt: voided.voidedAt?.toISOString() ?? null,
        correctionNotes: notes,
        reason: 'attendance_range_update',
      },
    });
  }
}

async function writeWorkdayInOut(
  context: OrgContext,
  day: AttendanceDayRecord,
  employeeId: string,
  workDate: string,
  clockInAt: Date,
  clockOutAt: Date,
  notes: string | null,
): Promise<void> {
  const clockIn = await insertAttendanceEvent(context.db, {
    organizationId: context.organizationId,
    attendanceDayId: day.id,
    eventType: 'clock_in',
    occurredAt: clockInAt,
    source: 'manual',
    notes,
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_EVENT_RECORDED,
    entityType: 'attendance_event',
    entityId: clockIn.id,
    after: {
      attendanceDayId: day.id,
      employeeId,
      workDate,
      eventType: 'clock_in',
      occurredAt: clockIn.occurredAt.toISOString(),
      source: 'manual',
      rangeApply: true,
    },
  });

  const clockOut = await insertAttendanceEvent(context.db, {
    organizationId: context.organizationId,
    attendanceDayId: day.id,
    eventType: 'clock_out',
    occurredAt: clockOutAt,
    source: 'manual',
    notes,
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_EVENT_RECORDED,
    entityType: 'attendance_event',
    entityId: clockOut.id,
    after: {
      attendanceDayId: day.id,
      employeeId,
      workDate,
      eventType: 'clock_out',
      occurredAt: clockOut.occurredAt.toISOString(),
      source: 'manual',
      rangeApply: true,
    },
  });

  await refreshDayStatus(context, day);
}

/**
 * Owner write rule gate: any existing attendance in the selected period
 * requires overwriteConfirmed (UI double approval) before mutation.
 * Mixed ranges (some new + some existing) use the same gate for the whole op.
 */
export function requiresAttendanceOverwriteApproval(
  existingCount: number,
  overwriteConfirmed: boolean,
): boolean {
  return existingCount > 0 && !overwriteConfirmed;
}

/**
 * Integration-test only. Throws inside the apply transaction after a named phase
 * so callers can prove full rollback. Ignored outside Vitest.
 */
export type AttendanceApplyRollbackProbe =
  | 'after_attendance'
  | 'after_project_work'
  | 'after_costing'
  | 'during_audit';

export interface AttendanceApplyOptions {
  readonly rollbackProbe?: AttendanceApplyRollbackProbe;
}

function fireRollbackProbe(
  options: AttendanceApplyOptions | undefined,
  phase: AttendanceApplyRollbackProbe,
): void {
  if (process.env.VITEST !== 'true') return;
  if (options?.rollbackProbe !== phase) return;
  throw new DomainRuleError(
    `Attendance apply rollback probe: ${phase}`,
    'workforce.errors.attendanceApplyRollbackProbe',
    { phase },
  );
}

/**
 * Apply a normal workday (clock_in + clock_out) across selected weekdays in a date range.
 *
 * Owner write rule:
 * - No existing attendance on any selected date → save immediately (+ project sync).
 * - Any existing attendance → require overwriteConfirmed (double UI approval); then
 *   overwrite attendance and reconcile project work atomically for the whole range.
 *
 * When project work is included (or overwrite clears prior time), the full mutation
 * runs in ONE database transaction. Failure → zero committed business change.
 */
export async function applyManualAttendanceWorkdayRange(
  context: OrgContext,
  rawInput: unknown,
  options?: AttendanceApplyOptions,
): Promise<AttendanceWorkdayWriteOutcome> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const input = parseOrThrow(manualAttendanceWorkdayRangeSchema, rawInput);
  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  const dates = expandAttendanceRangeDates({
    fromDate: input.fromDate,
    toDate: input.toDate,
    weekdays: input.weekdays,
  });
  if (dates.length === 0) {
    throw new DomainRuleError('Empty attendance range', 'workforce.errors.emptyBulk');
  }

  const preview = await classifyAttendanceRangeDates(context, input.employeeId, dates);

  if (requiresAttendanceOverwriteApproval(preview.existingCount, input.overwriteConfirmed)) {
    return {
      status: 'needs_overwrite_approval',
      summary: {
        employeeId: employee.id,
        employeeName: employee.name,
        fromDate: input.fromDate,
        toDate: input.toDate,
        dayCount: dates.length,
        existingCount: preview.existingCount,
        newCount: preview.newCount,
        clockInTime: input.clockInTime,
        clockOutTime: input.clockOutTime,
        workScope: input.workScope,
        projectId: input.projectId ?? null,
      },
    };
  }

  const forceOverwrite = preview.existingCount > 0 && input.overwriteConfirmed;
  const syncCandidateDates = dates.filter((workDate) => preview.kindsByDate[workDate] !== 'void');
  const includesProjectWork = input.workScope === 'project' && Boolean(input.projectId);
  const mutatesTimeFacts = forceOverwrite || includesProjectWork;

  // Reject closed months BEFORE any write begins.
  if (mutatesTimeFacts) {
    const { isMonthClosed, yearMonthFromBusinessDate } = await import('@/modules/month-close');
    const closedMonths = new Set<string>();
    for (const workDate of syncCandidateDates) {
      const yearMonth = yearMonthFromBusinessDate(workDate);
      if (closedMonths.has(yearMonth)) continue;
      if (await isMonthClosed(context, yearMonth)) {
        closedMonths.add(yearMonth);
      }
    }
    if (closedMonths.size > 0) {
      throw new DomainRuleError(
        'Attendance write intersects a closed financial period',
        'workforce.errors.attendanceClosedPeriod',
        { closedMonths: [...closedMonths].sort() },
      );
    }
  }

  const { hoursBetweenClockTimes } = await import('../validation/schemas');
  const hours = hoursBetweenClockTimes(input.clockInTime, input.clockOutTime);

  return withTransaction(context.db, async (tx) => {
    const txCtx = withExecutor(context, tx);

    const createdDates: string[] = [];
    const updatedDates: string[] = [];
    const skippedExistingDates: string[] = [];
    const skippedVoidDates: string[] = [];

    for (const workDate of dates) {
      const kind = preview.kindsByDate[workDate] ?? 'new';

      if (kind === 'void') {
        skippedVoidDates.push(workDate);
        continue;
      }

      const clockInAt = localWallTimeToDate(workDate, input.clockInTime);
      const clockOutAt = localWallTimeToDate(workDate, input.clockOutTime);

      let day = await findAttendanceDayByEmployeeDate(
        txCtx.db,
        txCtx.organizationId,
        input.employeeId,
        workDate,
      );

      if (kind === 'existing' && day) {
        await voidActiveEventsForCorrection(txCtx, day, input.notes ?? null);
        await writeWorkdayInOut(
          txCtx,
          day,
          input.employeeId,
          workDate,
          clockInAt,
          clockOutAt,
          input.notes ?? null,
        );
        updatedDates.push(workDate);
        continue;
      }

      day = await ensureOpenDay(txCtx, input.employeeId, workDate);
      if (day.status === 'void') {
        skippedVoidDates.push(workDate);
        continue;
      }

      await writeWorkdayInOut(
        txCtx,
        day,
        input.employeeId,
        workDate,
        clockInAt,
        clockOutAt,
        input.notes ?? null,
      );
      createdDates.push(workDate);
    }

    if (createdDates.length === 0 && updatedDates.length === 0 && skippedVoidDates.length > 0) {
      throw new DomainRuleError(
        'All selected dates are void',
        'workforce.errors.attendanceDayVoid',
      );
    }

    await noteModuleUsage(txCtx.db, txCtx.organizationId, 'workforce');
    fireRollbackProbe(options, 'after_attendance');

    let projectTimeCreatedCount = 0;
    let projectTimeSkippedDuplicateCount = 0;
    let projectTimeApprovedCount = 0;
    let projectTimePendingCount = 0;
    let projectTimeVoidedDuplicateCount = 0;
    let projectTimeVoidedPriorWorkCount = 0;
    let projectTimeWarningKey: string | null = null;

    const syncDates = dates.filter((workDate) => !skippedVoidDates.includes(workDate));
    const syncOptions = { skipCostRecompute: true as const };

    if (forceOverwrite && syncDates.length > 0) {
      const { reconcileProjectWorkAfterAttendanceOverwrite } = await import(
        './attendance-project-sync'
      );
      const sync = await reconcileProjectWorkAfterAttendanceOverwrite(
        txCtx,
        {
          employeeId: input.employeeId,
          dates: syncDates,
          hours,
          notes: input.notes ?? null,
          workScope: input.workScope,
          projectId: input.projectId ?? null,
          fromDate: input.fromDate,
          toDate: input.toDate,
          weekdays: input.weekdays,
        },
        syncOptions,
      );
      projectTimeCreatedCount = sync.createdCount;
      projectTimeApprovedCount = sync.approvedCount;
      projectTimePendingCount = sync.pendingCount;
      projectTimeSkippedDuplicateCount = sync.skippedAlreadyApprovedCount;
      projectTimeVoidedDuplicateCount = sync.voidedDuplicateCount;
      projectTimeVoidedPriorWorkCount = sync.voidedPriorWorkCount;
      projectTimeWarningKey = sync.warningKey;
    } else if (includesProjectWork && syncDates.length > 0) {
      const { syncProjectWorkFromAttendance } = await import('./attendance-project-sync');
      const sync = await syncProjectWorkFromAttendance(
        txCtx,
        {
          employeeId: input.employeeId,
          projectId: input.projectId!,
          dates: syncDates,
          hours,
          notes: input.notes ?? null,
          fromDate: input.fromDate,
          toDate: input.toDate,
          weekdays: input.weekdays,
        },
        syncOptions,
      );
      projectTimeCreatedCount = sync.createdCount;
      projectTimeApprovedCount = sync.approvedCount;
      projectTimePendingCount = sync.pendingCount;
      projectTimeSkippedDuplicateCount = sync.skippedAlreadyApprovedCount;
      projectTimeVoidedDuplicateCount = sync.voidedDuplicateCount;
      projectTimeWarningKey = sync.warningKey;
    }

    fireRollbackProbe(options, 'after_project_work');

    if (mutatesTimeFacts && syncDates.length > 0) {
      const { recomputeEmployeeCostsAfterTimeChange } = await import('./daily-cost-recompute');
      await recomputeEmployeeCostsAfterTimeChange(txCtx, {
        employeeId: input.employeeId,
        workDates: syncDates,
      });
    }

    fireRollbackProbe(options, 'after_costing');

    if (forceOverwrite) {
      fireRollbackProbe(options, 'during_audit');
      await recordAuditEvent(txCtx, {
        action: AUDIT_ACTIONS.ATTENDANCE_EVENT_RECORDED,
        entityType: 'attendance_overwrite',
        entityId: input.employeeId,
        after: {
          fromDate: input.fromDate,
          toDate: input.toDate,
          dayCount: syncDates.length,
          existingCount: preview.existingCount,
          clockInTime: input.clockInTime,
          clockOutTime: input.clockOutTime,
          workScope: input.workScope,
          projectId: input.projectId,
          createdDates,
          updatedDates,
        },
      });
    }

    return {
      status: 'applied' as const,
      result: {
        dates,
        createdCount: createdDates.length,
        updatedCount: updatedDates.length,
        skippedExistingCount: skippedExistingDates.length,
        skippedVoidCount: skippedVoidDates.length,
        createdDates,
        updatedDates,
        skippedExistingDates,
        skippedVoidDates,
        projectTimeCreatedCount,
        projectTimeSkippedDuplicateCount,
        projectTimeApprovedCount,
        projectTimePendingCount,
        projectTimeVoidedDuplicateCount,
        projectTimeVoidedPriorWorkCount,
        projectTimeWarningKey,
      },
    };
  });
}

export function canViewAttendance(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.ATTENDANCE_READ) ||
    hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
    hasPermission(context, PERMISSIONS.ATTENDANCE_SELF)
  );
}

export function canManageAttendanceRecords(context: OrgContext): boolean {
  return canManageAttendance(context);
}

export function canClockAttendance(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
    hasPermission(context, PERMISSIONS.ATTENDANCE_SELF)
  );
}

/**
 * Returns active employees who have NOT reported attendance for a given work date.
 * Requires ATTENDANCE_MANAGE permission (manager-only feature).
 */
export async function listEmployeesWithoutAttendanceToday(
  context: OrgContext,
  workDate: string,
): Promise<{ employeeId: string; employeeName: string }[]> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);
  return listEmployeesWithoutAttendanceTodayDb(context.db, context.organizationId, workDate);
}
