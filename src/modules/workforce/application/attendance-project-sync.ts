/**
 * Attendance → project-work sync + overwrite reconciliation.
 * Reuses time_entries only.
 *
 * Callers that wrap attendance + project work in one DB transaction must pass
 * a tx-bound OrgContext (`withExecutor`) so every helper uses the same client.
 */
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listTimeEntries, voidTimeEntryRow } from '../data/time-entries.repository';
import { hoursEqualLoose } from '../domain/daily-time-integrity';
import type { TimeEntryRecord } from '../domain/types';
import { assertNotSelfTimeApproval, isUnrestrictedOwner } from './time-scope';
import { createBulkTimeEntries, createTimeEntry, deleteDraftTimeEntry } from './time-entries';
import { approveTimeEntry, submitTimeEntries } from './timesheets';
import { recomputeEmployeeCostsAfterTimeChange } from './daily-cost-recompute';

export interface AttendanceProjectSyncResult {
  readonly createdCount: number;
  readonly approvedCount: number;
  readonly pendingCount: number;
  readonly skippedAlreadyApprovedCount: number;
  readonly voidedDuplicateCount: number;
  readonly voidedPriorWorkCount: number;
  /** Informational only after a successful commit (e.g. pending approval). Never used for partial save. */
  readonly warningKey: string | null;
}

export interface AttendanceProjectSyncOptions {
  /** When true, skip per-entry costing; caller recomputes once inside the same transaction. */
  readonly skipCostRecompute?: boolean;
}

async function canApproveEmployeeTime(
  context: OrgContext,
  employeeId: string,
): Promise<boolean> {
  if (!hasPermission(context, PERMISSIONS.TIME_APPROVE)) return false;
  try {
    await assertNotSelfTimeApproval(context, employeeId);
    return true;
  } catch {
    return isUnrestrictedOwner(context);
  }
}

function hoursMatch(left: string, right: string): boolean {
  try {
    return hoursEqualLoose(left, right);
  } catch {
    return left.trim() === right.trim();
  }
}

function matchingProjectDayEntries(
  rows: readonly TimeEntryRecord[],
  projectId: string,
  hours: string,
): TimeEntryRecord[] {
  return rows
    .filter(
      (row) =>
        row.status === 'recorded' &&
        !row.voidedAt &&
        !row.archivedAt &&
        row.kind === 'project' &&
        row.projectId === projectId &&
        hoursMatch(row.hours, hours),
    )
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function promoteToApproved(
  context: OrgContext,
  entry: TimeEntryRecord,
  options?: AttendanceProjectSyncOptions,
): Promise<TimeEntryRecord> {
  if (entry.approvalStatus === 'approved') return entry;

  let current = entry;
  if (current.approvalStatus === 'draft' || current.approvalStatus === 'returned') {
    await submitTimeEntries(context, { entryIds: [current.id] });
    const refreshed = await listTimeEntries(context.db, context.organizationId, {
      employeeId: current.employeeId,
      fromDate: current.workDate,
      toDate: current.workDate,
      status: 'recorded',
      approvalStatus: 'all',
      limit: 50,
    });
    const found = refreshed.find((row) => row.id === current.id);
    if (!found) {
      throw new DomainRuleError(
        'Time entry missing after submit',
        'workforce.errors.attendanceProjectTimeFailed',
      );
    }
    current = found;
  }

  if (current.approvalStatus === 'submitted') {
    const approved = await approveTimeEntry(context, { timeEntryId: current.id });
    if (options?.skipCostRecompute) {
      // approveTimeEntry already recomputed; acceptable inside outer tx.
    }
    return approved;
  }

  return current;
}

/**
 * Remove current recorded work on a date so overwrite can rewrite the business fact.
 * Drafts are deleted; submitted/approved rows are voided (audit preserved).
 */
async function clearRecordedWorkForDate(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly workDate: string;
    readonly keepEntryId?: string | null;
  },
): Promise<number> {
  const dayRows = await listTimeEntries(context.db, context.organizationId, {
    employeeId: input.employeeId,
    fromDate: input.workDate,
    toDate: input.workDate,
    status: 'recorded',
    approvalStatus: 'all',
    limit: 200,
  });

  let cleared = 0;
  for (const row of dayRows) {
    if (row.voidedAt || row.archivedAt) continue;
    if (input.keepEntryId && row.id === input.keepEntryId) continue;

    if (row.approvalStatus === 'draft' || row.approvalStatus === 'returned') {
      try {
        await deleteDraftTimeEntry(context, { timeEntryId: row.id });
        cleared += 1;
        continue;
      } catch {
        /* fall through to void */
      }
    }

    const voided = await voidTimeEntryRow(
      context.db,
      context.organizationId,
      row.id,
      new Date(),
    );
    if (voided) {
      cleared += 1;
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.TIME_ENTRY_VOIDED,
        entityType: 'time_entry',
        entityId: voided.id,
        before: {
          hours: row.hours,
          projectId: row.projectId,
          kind: row.kind,
          approvalStatus: row.approvalStatus,
          workDate: row.workDate,
        },
        after: {
          voidedAt: voided.voidedAt?.toISOString() ?? null,
          reason: 'attendance_overwrite',
        },
      });
    }
  }
  return cleared;
}

/**
 * Initial sync (no prior attendance overwrite): create/promote matching project work.
 * Failures throw — callers must run inside the same DB transaction as attendance.
 */
export async function syncProjectWorkFromAttendance(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly projectId: string;
    readonly dates: readonly string[];
    readonly hours: string;
    readonly notes?: string | null;
    readonly fromDate: string;
    readonly toDate: string;
    readonly weekdays: readonly number[];
  },
  options?: AttendanceProjectSyncOptions,
): Promise<AttendanceProjectSyncResult> {
  if (!hasPermission(context, PERMISSIONS.TIME_MANAGE)) {
    throw new DomainRuleError(
      'Project time sync requires time.manage',
      'workforce.errors.attendanceProjectTimeNoPermission',
    );
  }

  if (input.dates.length === 0) {
    return {
      createdCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      skippedAlreadyApprovedCount: 0,
      voidedDuplicateCount: 0,
      voidedPriorWorkCount: 0,
      warningKey: null,
    };
  }

  const canApprove = await canApproveEmployeeTime(context, input.employeeId);
  let createdCount = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let skippedAlreadyApprovedCount = 0;
  let voidedDuplicateCount = 0;
  const datesNeedingCreate: string[] = [];
  const skipCost = { skipCostRecompute: options?.skipCostRecompute === true };

  for (const workDate of input.dates) {
    const dayRows = await listTimeEntries(context.db, context.organizationId, {
      employeeId: input.employeeId,
      fromDate: workDate,
      toDate: workDate,
      kind: 'project',
      projectId: input.projectId,
      status: 'recorded',
      approvalStatus: 'all',
      limit: 100,
    });

    const matches = matchingProjectDayEntries(dayRows, input.projectId, input.hours);
    if (matches.length === 0) {
      datesNeedingCreate.push(workDate);
      continue;
    }

    const [keeper, ...dupes] = matches;
    for (const dupe of dupes) {
      if (dupe.approvalStatus === 'draft' || dupe.approvalStatus === 'returned') {
        try {
          await deleteDraftTimeEntry(context, { timeEntryId: dupe.id });
          voidedDuplicateCount += 1;
        } catch {
          await voidTimeEntryRow(context.db, context.organizationId, dupe.id, new Date());
          voidedDuplicateCount += 1;
        }
      } else if (
        dupe.approvalStatus === 'submitted' &&
        keeper!.approvalStatus === 'approved'
      ) {
        await voidTimeEntryRow(context.db, context.organizationId, dupe.id, new Date());
        voidedDuplicateCount += 1;
      }
    }

    const primary = keeper!;
    if (primary.approvalStatus === 'approved') {
      skippedAlreadyApprovedCount += 1;
      continue;
    }

    if (canApprove) {
      const approved = await promoteToApproved(context, primary, options);
      if (approved.approvalStatus === 'approved') approvedCount += 1;
      else pendingCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  if (datesNeedingCreate.length > 0) {
    if (canApprove) {
      for (const workDate of datesNeedingCreate) {
        const entry = await createTimeEntry(
          context,
          {
            employeeId: input.employeeId,
            workDate: businessDate(workDate),
            hours: input.hours,
            kind: 'project',
            projectId: input.projectId,
            description: input.notes ?? null,
            confirmDailyExcess: true,
            approveOnCreate: true,
          },
          skipCost,
        );
        createdCount += 1;
        if (entry.approvalStatus === 'approved') approvedCount += 1;
        else pendingCount += 1;
      }
    } else {
      const bulk = await createBulkTimeEntries(
        context,
        {
          employeeId: input.employeeId,
          fromDate: businessDate(input.fromDate),
          toDate: businessDate(input.toDate),
          weekdays: [...input.weekdays],
          dayHours: datesNeedingCreate.map((workDate) => ({
            workDate: businessDate(workDate),
            hours: input.hours,
          })),
          kind: 'project',
          projectId: input.projectId,
          description: input.notes ?? null,
          confirmDailyExcess: true,
        },
        skipCost,
      );
      createdCount += bulk.entries.length;
      pendingCount += bulk.entries.length;
    }
  }

  return {
    createdCount,
    approvedCount,
    pendingCount,
    skippedAlreadyApprovedCount,
    voidedDuplicateCount,
    voidedPriorWorkCount: 0,
    warningKey:
      !canApprove && (createdCount > 0 || pendingCount > 0)
        ? 'workforce.errors.attendanceProjectTimePendingApproval'
        : null,
  };
}

/**
 * Overwrite reconciliation after Owner double-approval:
 * clear prior project/non-project work on each date, then write the new association.
 * Must run on the same transaction client as attendance mutations.
 */
export async function reconcileProjectWorkAfterAttendanceOverwrite(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly dates: readonly string[];
    readonly hours: string;
    readonly notes?: string | null;
    readonly workScope: 'general' | 'project';
    readonly projectId: string | null;
    readonly fromDate: string;
    readonly toDate: string;
    readonly weekdays: readonly number[];
  },
  options?: AttendanceProjectSyncOptions,
): Promise<AttendanceProjectSyncResult> {
  if (input.workScope === 'project' && !hasPermission(context, PERMISSIONS.TIME_MANAGE)) {
    throw new DomainRuleError(
      'Project time sync requires time.manage',
      'workforce.errors.attendanceProjectTimeNoPermission',
    );
  }

  let voidedPriorWorkCount = 0;
  if (hasPermission(context, PERMISSIONS.TIME_MANAGE)) {
    for (const workDate of input.dates) {
      voidedPriorWorkCount += await clearRecordedWorkForDate(context, {
        employeeId: input.employeeId,
        workDate,
      });
    }
  }

  if (!options?.skipCostRecompute) {
    await recomputeEmployeeCostsAfterTimeChange(context, {
      employeeId: input.employeeId,
      workDates: [...input.dates],
    });
  }

  if (input.workScope !== 'project' || !input.projectId) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.TIME_ENTRY_BULK_CREATED,
      entityType: 'attendance_overwrite',
      entityId: input.employeeId,
      after: {
        workScope: 'general',
        dates: input.dates,
        voidedPriorWorkCount,
        hours: input.hours,
      },
    });
    return {
      createdCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      skippedAlreadyApprovedCount: 0,
      voidedDuplicateCount: 0,
      voidedPriorWorkCount,
      warningKey: null,
    };
  }

  const sync = await syncProjectWorkFromAttendance(
    context,
    {
      employeeId: input.employeeId,
      projectId: input.projectId,
      dates: input.dates,
      hours: input.hours,
      notes: input.notes ?? null,
      fromDate: input.fromDate,
      toDate: input.toDate,
      weekdays: input.weekdays,
    },
    options,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_BULK_CREATED,
    entityType: 'attendance_overwrite',
    entityId: input.employeeId,
    after: {
      workScope: 'project',
      projectId: input.projectId,
      dates: input.dates,
      voidedPriorWorkCount,
      hours: input.hours,
      createdCount: sync.createdCount,
      approvedCount: sync.approvedCount,
    },
  });

  return { ...sync, voidedPriorWorkCount };
}
