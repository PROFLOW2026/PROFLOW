import { and, eq, gte, lte } from 'drizzle-orm';
import { employeeAttendanceOutcomes, employees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { BusinessDate } from '@/shared/dates';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  isWithinEmploymentRange,
  resolveAttendanceDayState,
  type AttendanceDayState,
  type EmploymentRange,
} from '../domain/employment-active-range';

export type AbsenceReason = 'unpaid_leave' | 'vacation' | 'sick' | 'rest_day' | 'other';

export interface AttendanceOutcomeListItem {
  readonly workDate: BusinessDate;
  readonly outcome: 'worked' | 'not_worked';
  readonly absenceCompensation: 'paid' | 'unpaid' | null;
}

export async function listAttendanceOutcomesForEmployeeMonth(
  context: OrgContext,
  employeeId: string,
  yearMonth: string,
): Promise<AttendanceOutcomeListItem[]> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const fromDate = `${yearMonth}-01` as BusinessDate;
  const lastDay = new Date(`${yearMonth}-01T12:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const toDate = lastDay.toISOString().slice(0, 10) as BusinessDate;

  const rows = await context.db
    .select({
      workDate: employeeAttendanceOutcomes.workDate,
      outcome: employeeAttendanceOutcomes.outcome,
      absenceCompensation: employeeAttendanceOutcomes.absenceCompensation,
    })
    .from(employeeAttendanceOutcomes)
    .where(
      and(
        eq(employeeAttendanceOutcomes.organizationId, context.organizationId),
        eq(employeeAttendanceOutcomes.employeeId, employeeId),
        gte(employeeAttendanceOutcomes.workDate, fromDate),
        lte(employeeAttendanceOutcomes.workDate, toDate),
      ),
    );

  return rows.map((row) => ({
    workDate: row.workDate as BusinessDate,
    outcome: row.outcome as 'worked' | 'not_worked',
    absenceCompensation: row.absenceCompensation as 'paid' | 'unpaid' | null,
  }));
}

export interface SaveAttendanceOutcomeInput {
  readonly employeeId: string;
  readonly workDate: BusinessDate;
  readonly outcome: 'worked' | 'not_worked';
  readonly absenceReason?: AbsenceReason | null;
  readonly absenceCompensation?: 'paid' | 'unpaid' | null;
  readonly notes?: string | null;
}

export async function saveAttendanceOutcome(
  context: OrgContext,
  input: SaveAttendanceOutcomeInput,
): Promise<void> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const [employee] = await context.db
    .select({ hireDate: employees.hireDate, endDate: employees.endDate })
    .from(employees)
    .where(
      and(eq(employees.id, input.employeeId), eq(employees.organizationId, context.organizationId)),
    )
    .limit(1);

  if (!employee) return;

  const range: EmploymentRange = {
    hireDate: (employee.hireDate as BusinessDate | null) ?? null,
    endDate: (employee.endDate as BusinessDate | null) ?? null,
  };
  if (!isWithinEmploymentRange(input.workDate, range)) {
    return;
  }

  if (input.outcome === 'worked') {
    await context.db
      .insert(employeeAttendanceOutcomes)
      .values({
        organizationId: context.organizationId,
        employeeId: input.employeeId,
        workDate: input.workDate,
        outcome: 'worked',
        notes: input.notes ?? null,
        createdByUserId: context.userId,
      })
      .onConflictDoUpdate({
        target: [
          employeeAttendanceOutcomes.organizationId,
          employeeAttendanceOutcomes.employeeId,
          employeeAttendanceOutcomes.workDate,
        ],
        set: {
          outcome: 'worked',
          absenceReason: null,
          absenceCompensation: null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        },
      });
    return;
  }

  await context.db
    .insert(employeeAttendanceOutcomes)
    .values({
      organizationId: context.organizationId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      outcome: 'not_worked',
      absenceReason: input.absenceReason ?? 'other',
      absenceCompensation: input.absenceCompensation ?? 'unpaid',
      notes: input.notes ?? null,
      createdByUserId: context.userId,
    })
    .onConflictDoUpdate({
      target: [
        employeeAttendanceOutcomes.organizationId,
        employeeAttendanceOutcomes.employeeId,
        employeeAttendanceOutcomes.workDate,
      ],
      set: {
        outcome: 'not_worked',
        absenceReason: input.absenceReason ?? 'other',
        absenceCompensation: input.absenceCompensation ?? 'unpaid',
        notes: input.notes ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function saveAttendanceOutcomeRange(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly fromDate: BusinessDate;
    readonly toDate: BusinessDate;
    readonly workDates?: readonly BusinessDate[];
  } & Omit<SaveAttendanceOutcomeInput, 'employeeId' | 'workDate'>,
): Promise<number> {
  const dates =
    input.workDates && input.workDates.length > 0
      ? input.workDates
      : enumerateDates(input.fromDate, input.toDate);

  let count = 0;
  for (const workDate of dates) {
    await saveAttendanceOutcome(context, {
      employeeId: input.employeeId,
      workDate,
      outcome: input.outcome,
      absenceReason: input.absenceReason,
      absenceCompensation: input.absenceCompensation,
      notes: input.notes,
    });
    count += 1;
  }
  return count;
}

function enumerateDates(from: BusinessDate, to: BusinessDate): BusinessDate[] {
  const out: BusinessDate[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10) as BusinessDate);
  }
  return out;
}

export async function countUnpaidAbsenceDaysInMonth(
  context: OrgContext,
  employeeId: string,
  yearMonth: string,
): Promise<number> {
  const fromDate = `${yearMonth}-01` as BusinessDate;
  const lastDay = new Date(`${yearMonth}-01T12:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const toDate = lastDay.toISOString().slice(0, 10) as BusinessDate;

  const rows = await context.db
    .select({ workDate: employeeAttendanceOutcomes.workDate })
    .from(employeeAttendanceOutcomes)
    .where(
      and(
        eq(employeeAttendanceOutcomes.organizationId, context.organizationId),
        eq(employeeAttendanceOutcomes.employeeId, employeeId),
        eq(employeeAttendanceOutcomes.outcome, 'not_worked'),
        eq(employeeAttendanceOutcomes.absenceCompensation, 'unpaid'),
        gte(employeeAttendanceOutcomes.workDate, fromDate),
        lte(employeeAttendanceOutcomes.workDate, toDate),
      ),
    );

  return rows.length;
}

export function mapOutcomeState(
  workDate: BusinessDate,
  employment: EmploymentRange,
  outcome: {
    outcome: string;
    absenceCompensation: string | null;
  } | null,
): AttendanceDayState {
  return resolveAttendanceDayState({
    workDate,
    employment,
    outcome: outcome
      ? {
          outcome: outcome.outcome as 'worked' | 'not_worked',
          absenceCompensation: outcome.absenceCompensation as 'paid' | 'unpaid' | null,
        }
      : null,
  });
}
