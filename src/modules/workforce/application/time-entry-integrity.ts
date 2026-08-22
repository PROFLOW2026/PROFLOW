import { ConflictError, DomainRuleError } from '@/shared/errors';
import type { DbExecutor } from '@/shared/db/types';
import {
  breakdownDailyHours,
  allocateDailyExcessAcrossEntries,
  isExactDuplicateCandidate,
  normalizeExcessFieldsForInsert,
  reconcileExcessApprovalStatus,
  type DailyHoursBreakdown,
} from '../domain/daily-time-integrity';
import type { TimeEntryKind, TimeEntryRecord } from '../domain/types';
import {
  findTimeEntryByClientRequestId,
  listTimeEntriesForDuplicateCheck,
  sumDailyHoursForEmployee,
  updateTimeEntryDailyExcess,
} from '../data/time-entries.repository';
import { lockEmployeeRowForUpdate } from '../data/employees.repository';
import { resolveEmployeeDailyFramework } from './work-calendar-context';

export interface TimeEntryIntegrityInput {
  readonly employeeId: string;
  readonly workDate: string;
  readonly hours: string;
  readonly kind: TimeEntryKind;
  readonly projectId?: string | null;
  readonly workPackageId?: string | null;
  readonly phaseId?: string | null;
  readonly timeCodeId?: string | null;
  readonly description?: string | null;
  readonly clientRequestId?: string | null;
  readonly confirmDailyExcess?: boolean;
  readonly excludeEntryId?: string;
  readonly reportedSoFarOverride?: string;
}

export interface TimeEntryIntegrityResult {
  readonly breakdown: DailyHoursBreakdown | null;
  readonly excessHours: string | null;
  readonly excessApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
}

export async function assertTimeEntryIntegrity(
  db: DbExecutor,
  organizationId: string,
  input: TimeEntryIntegrityInput,
): Promise<TimeEntryIntegrityResult> {
  await lockEmployeeRowForUpdate(db, organizationId, input.employeeId);

  const framework = await resolveEmployeeDailyFramework(db, organizationId, input.employeeId);
  const reportedSoFar =
    input.reportedSoFarOverride ??
    (await sumDailyHoursForEmployee(db, organizationId, input.employeeId, input.workDate, {
      excludeEntryId: input.excludeEntryId,
    }));

  let breakdown: DailyHoursBreakdown | null = null;

  if (framework.configured) {
    breakdown = breakdownDailyHours({
      standardHoursPerDay: framework.standardHoursPerDay,
      reportedSoFar,
      newHours: input.hours,
    });

    if (breakdown.exceedsDailyFramework && !input.confirmDailyExcess) {
      throw new DomainRuleError(
        'Reported hours exceed the employee daily framework',
        'workforce.errors.dailyHoursExceeded',
        { breakdown },
      );
    }
  }

  const normalized = normalizeExcessFieldsForInsert({
    hours: input.hours,
    excessHours: null,
    excessApprovalStatus: null,
  });

  const existingRows = await listTimeEntriesForDuplicateCheck(db, organizationId, {
    employeeId: input.employeeId,
    workDate: input.workDate,
    excludeEntryId: input.excludeEntryId,
  });
  for (const row of existingRows) {
    if (
      isExactDuplicateCandidate({
        candidate: {
          employeeId: input.employeeId,
          workDate: input.workDate,
          kind: input.kind,
          projectId: input.projectId ?? null,
          hours: input.hours,
          workPackageId: input.workPackageId,
          phaseId: input.phaseId,
          timeCodeId: input.timeCodeId,
          description: input.description,
        },
        existing: {
          id: row.id,
          projectId: row.projectId,
          workDate: row.workDate,
          hours: row.hours,
          workPackageId: row.workPackageId,
          phaseId: row.phaseId,
          timeCodeId: row.timeCodeId,
          description: row.description,
        },
      })
    ) {
      throw new ConflictError(
        'This time entry already exists',
        'workforce.errors.exactDuplicateTimeEntry',
        {
          existingEntryId: row.id,
          projectId: row.projectId,
          workDate: row.workDate,
          hours: row.hours,
        },
      );
    }
  }

  return {
    breakdown,
    excessHours: normalized.excessHours,
    excessApprovalStatus: normalized.excessApprovalStatus,
  };
}

export async function findIdempotentTimeEntry(
  db: DbExecutor,
  organizationId: string,
  clientRequestId: string | null | undefined,
): Promise<TimeEntryRecord | null> {
  const key = clientRequestId?.trim();
  if (!key) return null;
  return findTimeEntryByClientRequestId(db, organizationId, key);
}

/**
 * Recomputes per-entry excess for an employee/day after any authoritative change.
 * Uses stable chronological allocation — not frozen insertion-order snapshots.
 */
export async function reconcileDailyExcessForEmployeeDate(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
  workDate: string,
): Promise<void> {
  await lockEmployeeRowForUpdate(db, organizationId, employeeId);

  const framework = await resolveEmployeeDailyFramework(db, organizationId, employeeId);
  const entries = await listTimeEntriesForDuplicateCheck(db, organizationId, {
    employeeId,
    workDate,
  });

  if (!framework.configured) {
    for (const entry of entries) {
      if (entry.excessHours || entry.excessApprovalStatus) {
        await updateTimeEntryDailyExcess(db, organizationId, entry.id, {
          excessHours: null,
          excessApprovalStatus: null,
        });
      }
    }
    return;
  }

  const allocations = allocateDailyExcessAcrossEntries({
    standardHoursPerDay: framework.standardHoursPerDay,
    entries: entries.map((entry) => ({
      id: entry.id,
      hours: entry.hours,
      sortKey: `${entry.createdAt.toISOString()}#${entry.id}`,
    })),
  });

  const allocationById = new Map(allocations.map((row) => [row.entryId, row.excessHours]));

  for (const entry of entries) {
    const nextExcessHours = allocationById.get(entry.id) ?? null;
    const nextStatus = reconcileExcessApprovalStatus({
      previousExcessHours: entry.excessHours,
      previousStatus: entry.excessApprovalStatus,
      nextExcessHours,
    });
    const normalized = normalizeExcessFieldsForInsert({
      hours: entry.hours,
      excessHours: nextExcessHours,
      excessApprovalStatus: nextStatus,
    });

    if (
      (entry.excessHours ?? null) !== (normalized.excessHours ?? null) ||
      (entry.excessApprovalStatus ?? null) !== (normalized.excessApprovalStatus ?? null)
    ) {
      await updateTimeEntryDailyExcess(db, organizationId, entry.id, {
        excessHours: normalized.excessHours,
        excessApprovalStatus: normalized.excessApprovalStatus,
      });
    }
  }
}
