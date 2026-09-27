/**
 * Attendance Correction Request repository (0137).
 *
 * Thin data-access layer — no business logic here.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { attendanceCorrectionRequests } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export type AttendanceCorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface AttendanceCorrectionRequestRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly requestedClockIn: Date;
  readonly requestedClockOut: Date;
  readonly reason: string;
  readonly status: AttendanceCorrectionStatus;
  readonly requestedByUserId: string | null;
  readonly reviewedByUserId: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewerNote: string | null;
  readonly appliedAttendanceDayId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function mapRow(
  row: typeof attendanceCorrectionRequests.$inferSelect,
): AttendanceCorrectionRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    workDate: row.workDate,
    requestedClockIn: row.requestedClockIn,
    requestedClockOut: row.requestedClockOut,
    reason: row.reason,
    status: row.status as AttendanceCorrectionStatus,
    requestedByUserId: row.requestedByUserId ?? null,
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewerNote: row.reviewerNote ?? null,
    appliedAttendanceDayId: row.appliedAttendanceDayId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertAttendanceCorrectionRequest(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly employeeId: string;
    readonly workDate: string;
    readonly requestedClockIn: Date;
    readonly requestedClockOut: Date;
    readonly reason: string;
    readonly requestedByUserId: string | null;
  },
): Promise<AttendanceCorrectionRequestRecord> {
  const [row] = await db
    .insert(attendanceCorrectionRequests)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      requestedClockIn: input.requestedClockIn,
      requestedClockOut: input.requestedClockOut,
      reason: input.reason,
      status: 'pending',
      requestedByUserId: input.requestedByUserId ?? null,
    })
    .returning();

  return mapRow(row!);
}

export async function findCorrectionRequestById(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
): Promise<AttendanceCorrectionRequestRecord | null> {
  const [row] = await db
    .select()
    .from(attendanceCorrectionRequests)
    .where(
      and(
        eq(attendanceCorrectionRequests.id, requestId),
        eq(attendanceCorrectionRequests.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function listCorrectionRequestsByOrg(
  db: DbExecutor,
  organizationId: string,
  options: {
    readonly status?: AttendanceCorrectionStatus;
    readonly employeeId?: string;
    readonly limit?: number;
  } = {},
): Promise<AttendanceCorrectionRequestRecord[]> {
  const conditions = [eq(attendanceCorrectionRequests.organizationId, organizationId)];

  if (options.status) {
    conditions.push(eq(attendanceCorrectionRequests.status, options.status));
  }
  if (options.employeeId) {
    conditions.push(eq(attendanceCorrectionRequests.employeeId, options.employeeId));
  }

  const rows = await db
    .select()
    .from(attendanceCorrectionRequests)
    .where(and(...conditions))
    .orderBy(desc(attendanceCorrectionRequests.createdAt))
    .limit(options.limit ?? 200);

  return rows.map(mapRow);
}

export async function findPendingCorrectionForEmployeeDate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  workDate: string,
): Promise<AttendanceCorrectionRequestRecord | null> {
  const [row] = await db
    .select()
    .from(attendanceCorrectionRequests)
    .where(
      and(
        eq(attendanceCorrectionRequests.organizationId, organizationId),
        eq(attendanceCorrectionRequests.employeeId, employeeId),
        eq(attendanceCorrectionRequests.workDate, workDate),
        eq(attendanceCorrectionRequests.status, 'pending'),
      ),
    )
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function updateCorrectionRequestReview(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly requestId: string;
    readonly status: 'approved' | 'rejected';
    readonly reviewedByUserId: string;
    readonly reviewedAt: Date;
    readonly reviewerNote: string | null;
    readonly appliedAttendanceDayId?: string | null;
  },
): Promise<AttendanceCorrectionRequestRecord | null> {
  const [row] = await db
    .update(attendanceCorrectionRequests)
    .set({
      status: input.status,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: input.reviewedAt,
      reviewerNote: input.reviewerNote ?? null,
      appliedAttendanceDayId: input.appliedAttendanceDayId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(attendanceCorrectionRequests.id, input.requestId),
        eq(attendanceCorrectionRequests.organizationId, input.organizationId),
        eq(attendanceCorrectionRequests.status, 'pending'),
      ),
    )
    .returning();

  return row ? mapRow(row) : null;
}

/** Count pending correction requests for this org (used by month-close check). */
export async function countPendingCorrectionRequests(
  db: DbExecutor,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<{ count: number; ids: string[] }> {
  const rows = await db
    .select({ id: attendanceCorrectionRequests.id })
    .from(attendanceCorrectionRequests)
    .where(
      and(
        eq(attendanceCorrectionRequests.organizationId, organizationId),
        eq(attendanceCorrectionRequests.status, 'pending'),
        sql`${attendanceCorrectionRequests.workDate} >= ${fromDate}`,
        sql`${attendanceCorrectionRequests.workDate} <= ${toDate}`,
      ),
    )
    .limit(200);

  return {
    count: rows.length,
    ids: rows.slice(0, 12).map((row) => row.id),
  };
}
