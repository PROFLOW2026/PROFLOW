import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { employeeAttendanceOutcomes, employeeMonthCosts, employeePayrollPayments, employees } from '@drizzle/schema';
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
      : enumerateBusinessDates(input.fromDate, input.toDate);

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

export function enumerateBusinessDates(from: BusinessDate, to: BusinessDate): BusinessDate[] {
  const out: BusinessDate[] = [];
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10) as BusinessDate);
  }
  return out;
}

/** Every YYYY-MM touched by an inclusive business-date range (cross-month safe). */
export function yearMonthsInBusinessDateRange(
  fromDate: BusinessDate,
  toDate: BusinessDate,
): string[] {
  return distinctYearMonthsFromWorkDates(enumerateBusinessDates(fromDate, toDate));
}

/** Distinct YYYY-MM values with at least one stored outcome for this employee. */
export async function listYearMonthsWithAttendanceOutcomesForEmployee(
  context: OrgContext,
  employeeId: string,
): Promise<readonly string[]> {
  const rows = await context.db
    .select({ workDate: employeeAttendanceOutcomes.workDate })
    .from(employeeAttendanceOutcomes)
    .where(
      and(
        eq(employeeAttendanceOutcomes.organizationId, context.organizationId),
        eq(employeeAttendanceOutcomes.employeeId, employeeId),
      ),
    );

  return distinctYearMonthsFromWorkDates(rows.map((row) => row.workDate));
}

export function distinctYearMonthsFromWorkDates(workDates: readonly string[]): string[] {
  return [...new Set(workDates.map((date) => date.slice(0, 7)))].sort();
}

export function mergeYearMonths(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flat())].sort();
}

export interface AttendanceOutcomeChangeScope {
  readonly employeeId: string;
  /** Inclusive save range — every crossed calendar month is affected. */
  readonly fromDate?: BusinessDate;
  readonly toDate?: BusinessDate;
}

/**
 * All calendar months that must refresh after attendance-outcome edits:
 * save range months + stored outcome months + derived payroll / month-cost months.
 */
export async function resolveYearMonthsAffectedByAttendanceOutcomeChange(
  context: OrgContext,
  input: AttendanceOutcomeChangeScope,
): Promise<readonly string[]> {
  const saveRangeMonths =
    input.fromDate != null && input.toDate != null
      ? yearMonthsInBusinessDateRange(input.fromDate, input.toDate)
      : input.fromDate != null
        ? [input.fromDate.slice(0, 7)]
        : [];

  const outcomeMonths = await listYearMonthsWithAttendanceOutcomesForEmployee(
    context,
    input.employeeId,
  );

  const payrollRows = await context.db
    .select({ yearMonth: employeePayrollPayments.yearMonth })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        eq(employeePayrollPayments.employeeId, input.employeeId),
        isNull(employeePayrollPayments.voidedAt),
      ),
    );

  const costRows = await context.db
    .select({ yearMonth: employeeMonthCosts.yearMonth })
    .from(employeeMonthCosts)
    .where(
      and(
        eq(employeeMonthCosts.organizationId, context.organizationId),
        eq(employeeMonthCosts.employeeId, input.employeeId),
        inArray(employeeMonthCosts.status, ['draft', 'applied', 'closed']),
      ),
    );

  return mergeYearMonths(
    saveRangeMonths,
    outcomeMonths,
    payrollRows.map((row) => row.yearMonth),
    costRows.map((row) => row.yearMonth),
  );
}

/** @deprecated Use resolveYearMonthsAffectedByAttendanceOutcomeChange */
export async function listYearMonthsForAttendanceOutcomeRecompute(
  context: OrgContext,
  employeeId: string,
): Promise<readonly string[]> {
  return resolveYearMonthsAffectedByAttendanceOutcomeChange(context, { employeeId });
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

export async function listAttendanceOutcomesInRange(
  context: OrgContext,
  input: {
    readonly fromDate: BusinessDate;
    readonly toDate: BusinessDate;
    readonly employeeId?: string;
  },
): Promise<
  readonly {
    readonly employeeId: string;
    readonly workDate: BusinessDate;
    readonly outcome: 'worked' | 'not_worked';
    readonly absenceCompensation: 'paid' | 'unpaid' | null;
  }[]
> {
  assertPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);

  const conditions = [
    eq(employeeAttendanceOutcomes.organizationId, context.organizationId),
    gte(employeeAttendanceOutcomes.workDate, input.fromDate),
    lte(employeeAttendanceOutcomes.workDate, input.toDate),
  ];
  if (input.employeeId) {
    conditions.push(eq(employeeAttendanceOutcomes.employeeId, input.employeeId));
  }

  const rows = await context.db
    .select({
      employeeId: employeeAttendanceOutcomes.employeeId,
      workDate: employeeAttendanceOutcomes.workDate,
      outcome: employeeAttendanceOutcomes.outcome,
      absenceCompensation: employeeAttendanceOutcomes.absenceCompensation,
    })
    .from(employeeAttendanceOutcomes)
    .where(and(...conditions));

  return rows.map((row) => ({
    employeeId: row.employeeId,
    workDate: row.workDate as BusinessDate,
    outcome: row.outcome as 'worked' | 'not_worked',
    absenceCompensation: row.absenceCompensation as 'paid' | 'unpaid' | null,
  }));
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
