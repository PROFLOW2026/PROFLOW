/**
 * Attendance Correction Request application service (0137).
 *
 * Business rules:
 * - Employees (ATTENDANCE_SELF) submit correction requests for past dates.
 * - Managers (ATTENDANCE_MANAGE) can also submit on behalf of an employee.
 * - Only one PENDING request per employee per work date (duplicate → error).
 * - Manager approval voids existing attendance events for the day and inserts
 *   new clock_in + clock_out from the requested times (with audit trail).
 * - Rejection records the reviewer's note; attendance is NOT modified.
 * - Clock-in/out approval does NOT require manager approval (only project
 *   time allocation needs approval). This correction flow exists purely
 *   because employees cannot retroactively edit past attendance themselves.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findAttendanceDayByEmployeeDate,
  insertAttendanceDay,
  insertAttendanceEvent,
  listAttendanceEventsForDay,
  updateAttendanceDayStatus,
  voidAttendanceEventById,
} from '../data/attendance.repository';
import {
  countPendingCorrectionRequests,
  findCorrectionRequestById,
  findPendingCorrectionForEmployeeDate,
  insertAttendanceCorrectionRequest,
  listCorrectionRequestsByOrg,
  updateCorrectionRequestReview,
  type AttendanceCorrectionRequestRecord,
} from '../data/attendance-corrections.repository';
import { findEmployeeById, findEmployeeByUserId } from '../data/employees.repository';
import {
  listAttendanceCorrectionRequestsSchema,
  reviewAttendanceCorrectionRequestSchema,
  submitAttendanceCorrectionRequestSchema,
  type ListAttendanceCorrectionRequestsInput,
  type ReviewAttendanceCorrectionRequestInput,
  type SubmitAttendanceCorrectionRequestInput,
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

/** Resolve the employee for a correction request (self or explicit). */
async function resolveEmployeeForCorrection(
  context: OrgContext,
  requestedEmployeeId: string | undefined,
): Promise<{ id: string; name: string }> {
  const manage = hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);
  const self = hasPermission(context, PERMISSIONS.ATTENDANCE_SELF);

  if (manage && requestedEmployeeId) {
    const emp = await findEmployeeById(context.db, context.organizationId, requestedEmployeeId);
    if (!emp || emp.archivedAt) throw new NotFoundError('Employee');
    return emp;
  }

  // Self-service: resolve from linked employee.
  const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
  if (!linked || linked.archivedAt) {
    throw new DomainRuleError(
      'Signed-in user is not linked to an employee',
      'workforce.errors.noLinkedEmployee',
    );
  }

  if (requestedEmployeeId && requestedEmployeeId !== linked.id && !manage) {
    throw new DomainRuleError(
      'Attendance self scope is limited to the linked employee',
      'workforce.errors.attendanceSelfScope',
    );
  }

  return linked;
}

/**
 * Employee (or manager on behalf) submits a correction request for a past day.
 * Blocked if a PENDING request already exists for the same employee + date.
 */
export async function submitAttendanceCorrectionRequest(
  context: OrgContext,
  rawInput: SubmitAttendanceCorrectionRequestInput,
): Promise<AttendanceCorrectionRequestRecord> {
  assertAnyPermission(context, [PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.ATTENDANCE_SELF]);

  const input = parseOrThrow(submitAttendanceCorrectionRequestSchema, rawInput);
  const employee = await resolveEmployeeForCorrection(context, input.employeeId);

  const existing = await findPendingCorrectionForEmployeeDate(
    context.db,
    context.organizationId,
    employee.id,
    input.workDate,
  );
  if (existing) {
    throw new ConflictError(
      'A pending correction request already exists for this employee and date',
    );
  }

  const clockIn = new Date(input.requestedClockIn);
  const clockOut = new Date(input.requestedClockOut);
  if (Number.isNaN(clockIn.getTime()) || Number.isNaN(clockOut.getTime())) {
    throw new ValidationError([{ path: 'requestedClockIn', message: 'validation.invalidTimestamp' }]);
  }

  const request = await insertAttendanceCorrectionRequest(context.db, {
    organizationId: context.organizationId,
    employeeId: employee.id,
    workDate: input.workDate,
    requestedClockIn: clockIn,
    requestedClockOut: clockOut,
    reason: input.reason,
    requestedByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ATTENDANCE_EVENT_RECORDED,
    entityType: 'attendance_correction_request',
    entityId: request.id,
    after: {
      employeeId: employee.id,
      workDate: input.workDate,
      requestedClockIn: clockIn.toISOString(),
      requestedClockOut: clockOut.toISOString(),
      reason: input.reason,
      status: 'pending',
    },
  });

  return request;
}

/**
 * List correction requests (manager view: pending queue; scoped by employee for history).
 */
export async function listAttendanceCorrectionRequests(
  context: OrgContext,
  rawInput: ListAttendanceCorrectionRequestsInput = {},
): Promise<AttendanceCorrectionRequestRecord[]> {
  assertAnyPermission(context, [
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_SELF,
  ]);

  const input = parseOrThrow(listAttendanceCorrectionRequestsSchema, rawInput);

  // Self-only users may only see their own requests.
  let scopedEmployeeId = input.employeeId;
  if (!hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE)) {
    const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
    if (!linked || linked.archivedAt) return [];
    scopedEmployeeId = linked.id;
  }

  return listCorrectionRequestsByOrg(context.db, context.organizationId, {
    status: input.status === 'all' ? undefined : input.status,
    employeeId: scopedEmployeeId,
    limit: input.limit,
  });
}

/**
 * Manager approves or rejects a correction request.
 *
 * On APPROVAL:
 *   1. Void all existing attendance events for that day.
 *   2. Insert clock_in + clock_out from the requested times.
 *   3. Update day status to 'complete'.
 *   4. Set applied_attendance_day_id on the request.
 *
 * On REJECTION: only the request status is updated; attendance is untouched.
 */
export async function reviewAttendanceCorrectionRequest(
  context: OrgContext,
  rawInput: ReviewAttendanceCorrectionRequestInput,
): Promise<AttendanceCorrectionRequestRecord> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const input = parseOrThrow(reviewAttendanceCorrectionRequestSchema, rawInput);

  const request = await findCorrectionRequestById(
    context.db,
    context.organizationId,
    input.requestId,
  );
  if (!request) throw new NotFoundError('Attendance correction request');
  if (request.status !== 'pending') {
    throw new DomainRuleError(
      'Correction request has already been reviewed',
      'workforce.errors.correctionRequestAlreadyReviewed',
    );
  }

  const reviewedAt = new Date();

  if (input.decision === 'rejected') {
    const updated = await updateCorrectionRequestReview(context.db, {
      organizationId: context.organizationId,
      requestId: request.id,
      status: 'rejected',
      reviewedByUserId: context.userId,
      reviewedAt,
      reviewerNote: input.reviewerNote ?? null,
    });
    if (!updated) throw new NotFoundError('Attendance correction request');

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.ATTENDANCE_EVENT_VOIDED,
      entityType: 'attendance_correction_request',
      entityId: request.id,
      before: { status: 'pending' },
      after: { status: 'rejected', reviewerNote: input.reviewerNote ?? null },
    });

    return updated;
  }

  // APPROVAL: apply the correction inside a transaction.
  return withTransaction(context.db, async (tx) => {
    const txCtx = withExecutor(context, tx);

    // Ensure an attendance day row exists for the target date.
    let day = await findAttendanceDayByEmployeeDate(
      tx,
      context.organizationId,
      request.employeeId,
      request.workDate,
    );

    if (!day) {
      day = await insertAttendanceDay(tx, {
        organizationId: context.organizationId,
        employeeId: request.employeeId,
        workDate: request.workDate,
        status: 'open',
        createdByUserId: context.userId,
      });
    } else if (day.status === 'void') {
      throw new DomainRuleError(
        'Attendance day is void; cannot apply correction',
        'workforce.errors.attendanceDayVoid',
      );
    }

    // Void existing active events.
    const existingEvents = await listAttendanceEventsForDay(tx, context.organizationId, day.id);
    for (const event of existingEvents) {
      if (event.voidedAt) continue;
      await voidAttendanceEventById(tx, context.organizationId, event.id);
      await recordAuditEvent(txCtx, {
        action: AUDIT_ACTIONS.ATTENDANCE_EVENT_VOIDED,
        entityType: 'attendance_event',
        entityId: event.id,
        before: { eventType: event.eventType, occurredAt: event.occurredAt.toISOString() },
        after: { reason: 'attendance_correction_request_approved', requestId: request.id },
      });
    }

    // Insert corrected clock_in and clock_out.
    const clockIn = await insertAttendanceEvent(tx, {
      organizationId: context.organizationId,
      attendanceDayId: day.id,
      eventType: 'clock_in',
      occurredAt: request.requestedClockIn,
      source: 'manager',
      notes: `Correction approved (request ${request.id})`,
      createdByUserId: context.userId,
    });

    const clockOut = await insertAttendanceEvent(tx, {
      organizationId: context.organizationId,
      attendanceDayId: day.id,
      eventType: 'clock_out',
      occurredAt: request.requestedClockOut,
      source: 'manager',
      notes: `Correction approved (request ${request.id})`,
      createdByUserId: context.userId,
    });

    // Mark the day as complete.
    await updateAttendanceDayStatus(tx, context.organizationId, day.id, 'complete');

    // Stamp the request as approved.
    const updated = await updateCorrectionRequestReview(tx, {
      organizationId: context.organizationId,
      requestId: request.id,
      status: 'approved',
      reviewedByUserId: context.userId,
      reviewedAt,
      reviewerNote: input.reviewerNote ?? null,
      appliedAttendanceDayId: day.id,
    });
    if (!updated) throw new NotFoundError('Attendance correction request');

    await recordAuditEvent(txCtx, {
      action: AUDIT_ACTIONS.ATTENDANCE_EVENT_RECORDED,
      entityType: 'attendance_correction_request',
      entityId: request.id,
      before: { status: 'pending' },
      after: {
        status: 'approved',
        attendanceDayId: day.id,
        clockInEventId: clockIn.id,
        clockOutEventId: clockOut.id,
        requestedClockIn: request.requestedClockIn.toISOString(),
        requestedClockOut: request.requestedClockOut.toISOString(),
      },
    });

    return updated;
  });
}

/** How many pending correction requests exist in a period (for month-close check). */
export { countPendingCorrectionRequests };
