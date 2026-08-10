import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
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
  deriveAttendanceDayStatus,
  resolveClockPresenceState,
  type AttendanceEventSource,
  type ClockPresenceState,
} from '../domain/attendance';
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
  updateAttendanceDayStatus,
  voidAttendanceEventById,
} from '../data/attendance.repository';
import {
  attendanceFiltersSchema,
  clockAttendanceSchema,
  manualAttendanceEventSchema,
  replaceAttendanceEventSchema,
  voidAttendanceDaySchema,
  voidAttendanceEventSchema,
  type AttendanceFiltersInput,
  type ClockAttendanceInput,
  type ManualAttendanceEventInput,
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
  readonly canManage: boolean;
}

/** Worker-friendly clock surface for today (org TZ). Optional — unused orgs see empty. */
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
    status: parsed.status ?? 'all',
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
    employeeName: employee?.name ?? '—',
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

/** Manager manual entry (any allowed event type) — still not labor Actual. */
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
      // Roll forward would fail — still allow manager replace when only this type makes sense
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
