import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import { canReadWorkforceCost } from './workforce-cost-authz';
import {
  assertCanActOnEmployeeTime,
  assertNotSelfTimeApproval,
  canReadOrgWorkforce,
  resolveSelfScopedEmployeeId,
} from './time-scope';
import { findEmployeeById } from '../data/employees.repository';
import {
  findTimeEntryById,
  listTimeEntries,
  listTimeEntriesByIds,
} from '../data/time-entries.repository';
import {
  attachEntriesToTimesheet,
  findTimesheetByEmployeePeriodForUpdate,
  findTimesheetById,
  findTimesheetByIdForUpdate,
  insertTimesheet,
  listRecordedEntriesInPeriod,
  listTimesheets,
  updateEntriesApproval,
  updateTimesheetLifecycle,
} from '../data/timesheets.repository';
import {
  assertTimeApprovalTransition,
  assertTimesheetTransition,
  canSubmitApprovalStatus,
  timesheetPeriodForWorkDate,
} from '../domain/timesheet-lifecycle';
import type {
  TimeApprovalStatus,
  TimeEntryListItem,
  TimeEntryRecord,
  TimesheetListItem,
  TimesheetRecord,
} from '../domain/types';
import {
  approveTimeEntrySchema,
  approveTimesheetSchema,
  bulkApproveTimeEntriesSchema,
  returnTimesheetSchema,
  submitTimeEntriesSchema,
  submitTimesheetSchema,
  timesheetFiltersSchema,
  type ApproveTimeEntryInput,
  type ApproveTimesheetInput,
  type BulkApproveTimeEntriesInput,
  type ReturnTimesheetInput,
  type SubmitTimeEntriesInput,
  type SubmitTimesheetInput,
  type TimesheetFiltersInput,
} from '../validation/schemas';

function parseOrThrow<T>(parsed: {
  success: boolean;
  data?: T;
  error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
}): T {
  if (!parsed.success || parsed.data === undefined) {
    throw new ValidationError(
      (parsed.error?.issues ?? []).map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

function throwTimesheetRace(): never {
  throw new ConflictError('Timesheet was updated concurrently');
}

async function requireEmployee(
  context: OrgContext,
  employeeId: string,
): Promise<void> {
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
}

async function requireTimesheet(
  context: OrgContext,
  timesheetId: string,
): Promise<TimesheetRecord> {
  const sheet = await findTimesheetById(context.db, context.organizationId, timesheetId);
  if (!sheet || sheet.archivedAt) throw new NotFoundError('Timesheet');
  return sheet;
}

async function findOrCreateTimesheetForPeriod(
  context: OrgContext,
  employeeId: string,
  periodStart: string,
  periodEnd: string,
): Promise<TimesheetRecord> {
  const existing = await findTimesheetByEmployeePeriodForUpdate(
    context.db,
    context.organizationId,
    employeeId,
    periodStart,
  );
  if (existing) {
    if (existing.status === 'approved') {
      throw new DomainRuleError(
        'This period is already approved',
        'workforce.errors.timesheetPeriodApproved',
        { timesheetId: existing.id, periodStart },
      );
    }
    return existing;
  }

  try {
    return await insertTimesheet(context.db, {
      organizationId: context.organizationId,
      employeeId,
      periodStart,
      periodEnd,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findTimesheetByEmployeePeriodForUpdate(
      context.db,
      context.organizationId,
      employeeId,
      periodStart,
    );
    if (!raced) throwTimesheetRace();
    if (raced.status === 'approved') {
      throw new DomainRuleError(
        'This period is already approved',
        'workforce.errors.timesheetPeriodApproved',
        { timesheetId: raced.id, periodStart },
      );
    }
    return raced;
  }
}

export async function listTimesheetsForOrg(
  context: OrgContext,
  filters: TimesheetFiltersInput = {},
): Promise<TimesheetListItem[]> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.TIME_MANAGE]);
  const parsed = parseOrThrow(timesheetFiltersSchema.safeParse(filters));
  let scopedEmployeeId = parsed.employeeId;
  if (!canReadOrgWorkforce(context)) {
    const linkedId = await resolveSelfScopedEmployeeId(context);
    if (!linkedId) return [];
    if (parsed.employeeId && parsed.employeeId !== linkedId) {
      throw new DomainRuleError(
        'Time self scope is limited to the linked employee',
        'workforce.errors.timeSelfScope',
      );
    }
    scopedEmployeeId = linkedId;
  }
  return listTimesheets(context.db, context.organizationId, {
    employeeId: scopedEmployeeId,
    status: parsed.status ?? 'all',
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
  });
}

export async function listTimeApprovalQueue(
  context: OrgContext,
  filters: TimesheetFiltersInput = {},
): Promise<{
  readonly timesheets: TimesheetListItem[];
  readonly entries: TimeEntryListItem[];
}> {
  assertPermission(context, PERMISSIONS.TIME_APPROVE);
  const parsed = parseOrThrow(timesheetFiltersSchema.safeParse(filters));
  const requested = parsed.status ?? 'submitted';
  const timesheets = await listTimesheets(context.db, context.organizationId, {
    employeeId: parsed.employeeId,
    status: requested,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
  });

  const entries = await listTimeEntries(context.db, context.organizationId, {
    employeeId: parsed.employeeId,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
    status: 'recorded',
    approvalStatus: requested === 'all' ? 'all' : requested,
  });
  const allowed = await resolveAccessibleProjectIds(context);
  const canReadCost = canReadWorkforceCost(context);
  const visibleEntries = entries
    .filter((row) => isAccessibleProjectId(allowed, row.projectId))
    .map((row) =>
      canReadCost ? row : { ...row, costAmount: null, costCurrency: null },
    );

  return { timesheets, entries: visibleEntries };
}

export async function getTimesheetDetail(
  context: OrgContext,
  timesheetId: string,
): Promise<{
  readonly timesheet: TimesheetListItem;
  readonly entries: TimeEntryListItem[];
  readonly totals: {
    readonly projectHours: number;
    readonly nonProjectHours: number;
    readonly missingDays: number | null;
  };
}> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.TIME_MANAGE]);
  const sheet = await requireTimesheet(context, timesheetId);
  if (!canReadOrgWorkforce(context)) {
    await assertCanActOnEmployeeTime(context, sheet.employeeId);
  }
  const listed = await listTimesheets(context.db, context.organizationId, {
    employeeId: sheet.employeeId,
  });
  const named = listed.find((row) => row.id === sheet.id);
  const entries = await listTimeEntries(context.db, context.organizationId, {
    timesheetId: sheet.id,
    status: 'recorded',
    approvalStatus: 'all',
  });
  const allowed = await resolveAccessibleProjectIds(context);
  const canReadCost = canReadWorkforceCost(context);
  const visibleEntries = entries
    .filter((row) => isAccessibleProjectId(allowed, row.projectId))
    .map((row) =>
      canReadCost ? row : { ...row, costAmount: null, costCurrency: null },
    );

  let projectHours = 0;
  let nonProjectHours = 0;
  const daysWithHours = new Set<string>();
  for (const entry of visibleEntries) {
    const hours = Number(entry.hours) || 0;
    if (entry.kind === 'project') projectHours += hours;
    else nonProjectHours += hours;
    daysWithHours.add(entry.workDate);
  }

  const periodStart = new Date(`${sheet.periodStart}T00:00:00Z`);
  const periodEnd = new Date(`${sheet.periodEnd}T00:00:00Z`);
  let missingDays: number | null = null;
  if (
    !Number.isNaN(periodStart.getTime()) &&
    !Number.isNaN(periodEnd.getTime()) &&
    periodEnd >= periodStart
  ) {
    let expected = 0;
    for (
      const cursor = new Date(periodStart);
      cursor <= periodEnd;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      expected += 1;
    }
    missingDays = Math.max(0, expected - daysWithHours.size);
  }

  return {
    timesheet: named ?? {
      ...sheet,
      employeeName: '',
      entryCount: visibleEntries.length,
      totalHours: visibleEntries.reduce((sum, entry) => sum + Number(entry.hours), 0).toString(),
    },
    entries: visibleEntries,
    totals: { projectHours, nonProjectHours, missingDays },
  };
}

/**
 * New entries start as draft and do not create Actual.
 * Submit attaches them to the employee week timesheet (Sunday–Saturday).
 */
export async function submitTimesheet(
  context: OrgContext,
  rawInput: SubmitTimesheetInput,
): Promise<{ readonly timesheet: TimesheetRecord; readonly entries: readonly TimeEntryRecord[] }> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);
  const input = parseOrThrow(submitTimesheetSchema.safeParse(rawInput));
  await requireEmployee(context, input.employeeId);
  await assertCanActOnEmployeeTime(context, input.employeeId);

  const period = input.periodStart
    ? timesheetPeriodForWorkDate(input.periodStart)
    : input.workDate
      ? timesheetPeriodForWorkDate(input.workDate)
      : null;

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    let periodStart = period?.periodStart;
    let periodEnd = period?.periodEnd;

    let candidates: TimeEntryRecord[];
    if (input.entryIds && input.entryIds.length > 0) {
      candidates = await listTimeEntriesByIds(tx, context.organizationId, input.entryIds);
      if (candidates.length !== input.entryIds.length) throw new NotFoundError('Time entry');
      for (const entry of candidates) {
        if (entry.employeeId !== input.employeeId) {
          throw new DomainRuleError(
            'Time entries must belong to the same employee',
            'workforce.errors.timesheetEmployeeMismatch',
          );
        }
      }
      const first = candidates[0];
      if (!first) {
        throw new DomainRuleError('Nothing to submit', 'workforce.errors.nothingToSubmit');
      }
      const derived = timesheetPeriodForWorkDate(first.workDate);
      for (const entry of candidates) {
        const period = timesheetPeriodForWorkDate(entry.workDate);
        if (period.periodStart !== derived.periodStart) {
          throw new DomainRuleError(
            'Time entries must belong to the same timesheet period',
            'workforce.errors.invalidTimesheetPeriod',
          );
        }
      }
      periodStart = periodStart ?? derived.periodStart;
      periodEnd = periodEnd ?? derived.periodEnd;
    } else {
      if (!periodStart || !periodEnd) {
        throw new DomainRuleError(
          'Period is required to submit a timesheet',
          'workforce.errors.invalidTimesheetPeriod',
        );
      }
      candidates = await listRecordedEntriesInPeriod(
        tx,
        context.organizationId,
        input.employeeId,
        periodStart,
        periodEnd,
      );
    }

    const submittable = candidates.filter((entry) => canSubmitApprovalStatus(entry.approvalStatus));
    if (submittable.length === 0) {
      throw new DomainRuleError('Nothing to submit', 'workforce.errors.nothingToSubmit');
    }

    const sheet = await findOrCreateTimesheetForPeriod(
      txContext,
      input.employeeId,
      periodStart!,
      periodEnd!,
    );
    if (sheet.status === 'approved') {
      throw new DomainRuleError(
        'This period is already approved',
        'workforce.errors.timesheetPeriodApproved',
      );
    }
    if (sheet.status === 'draft' || sheet.status === 'returned') {
      assertTimesheetTransition(sheet.status, 'submitted');
    }

    const now = new Date();
    const ids = submittable.map((entry) => entry.id);
    await attachEntriesToTimesheet(tx, context.organizationId, sheet.id, ids);
    const updatedEntries = await updateEntriesApproval(tx, context.organizationId, {
      timeEntryIds: ids,
      fromStatuses: ['draft', 'returned'],
      approvalStatus: 'submitted',
      timesheetId: sheet.id,
      submittedAt: now,
      submittedByUserId: context.userId,
      decidedAt: null,
      decidedByUserId: null,
    });

    const updatedSheet =
      sheet.status === 'submitted'
        ? sheet
        : await updateTimesheetLifecycle(
            tx,
            context.organizationId,
            sheet.id,
            {
              status: 'submitted',
              submittedAt: now,
              submittedByUserId: context.userId,
              decidedAt: null,
              decidedByUserId: null,
            },
            { fromStatuses: ['draft', 'returned'] },
          );

    if (!updatedSheet) throwTimesheetRace();

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.TIMESHEET_SUBMITTED,
      entityType: 'timesheet',
      entityId: updatedSheet.id,
      after: {
        employeeId: updatedSheet.employeeId,
        periodStart: updatedSheet.periodStart,
        periodEnd: updatedSheet.periodEnd,
        entryIds: updatedEntries.map((entry) => entry.id),
        status: 'submitted',
      },
    });

    return { timesheet: updatedSheet, entries: updatedEntries };
  });
}

export async function submitTimeEntries(
  context: OrgContext,
  rawInput: SubmitTimeEntriesInput,
): Promise<{ readonly timesheet: TimesheetRecord; readonly entries: readonly TimeEntryRecord[] }> {
  const input = parseOrThrow(submitTimeEntriesSchema.safeParse(rawInput));
  const entries = await listTimeEntriesByIds(context.db, context.organizationId, input.entryIds);
  if (entries.length === 0) throw new NotFoundError('Time entry');
  const employeeId = entries[0]!.employeeId;
  return submitTimesheet(context, { employeeId, entryIds: input.entryIds });
}

export async function returnTimesheet(
  context: OrgContext,
  rawInput: ReturnTimesheetInput,
): Promise<{ readonly timesheet: TimesheetRecord; readonly entries: readonly TimeEntryRecord[] }> {
  assertPermission(context, PERMISSIONS.TIME_APPROVE);
  const input = parseOrThrow(returnTimesheetSchema.safeParse(rawInput));
  const note = input.managerNote.trim();
  if (!note) {
    throw new DomainRuleError(
      'A manager note is required when returning a timesheet',
      'workforce.errors.managerNoteRequired',
    );
  }

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const sheet = await findTimesheetByIdForUpdate(tx, context.organizationId, input.timesheetId);
    if (!sheet || sheet.archivedAt) throw new NotFoundError('Timesheet');
    await assertNotSelfTimeApproval(txContext, sheet.employeeId);
    assertTimesheetTransition(sheet.status, 'returned');

    const periodEntries = await listRecordedEntriesInPeriod(
      tx,
      context.organizationId,
      sheet.employeeId,
      sheet.periodStart,
      sheet.periodEnd,
    );
    const submitted = periodEntries.filter(
      (entry) =>
        entry.approvalStatus === 'submitted' &&
        (entry.timesheetId === sheet.id || entry.timesheetId == null),
    );

    const now = new Date();
    const updatedEntries = await updateEntriesApproval(tx, context.organizationId, {
      timeEntryIds: submitted.map((entry) => entry.id),
      fromStatuses: ['submitted'],
      approvalStatus: 'returned',
      timesheetId: sheet.id,
      decidedAt: now,
      decidedByUserId: context.userId,
      managerNote: note,
    });

    const updatedSheet = await updateTimesheetLifecycle(
      tx,
      context.organizationId,
      sheet.id,
      {
        status: 'returned',
        decidedAt: now,
        decidedByUserId: context.userId,
        managerNote: note,
      },
      { fromStatuses: ['submitted'] },
    );
    if (!updatedSheet) throwTimesheetRace();

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.TIMESHEET_RETURNED,
      entityType: 'timesheet',
      entityId: updatedSheet.id,
      after: {
        status: 'returned',
        managerNote: note,
        entryIds: updatedEntries.map((entry) => entry.id),
      },
    });

    return { timesheet: updatedSheet, entries: updatedEntries };
  });
}

export async function approveTimesheet(
  context: OrgContext,
  rawInput: ApproveTimesheetInput,
): Promise<{ readonly timesheet: TimesheetRecord; readonly entries: readonly TimeEntryRecord[] }> {
  assertPermission(context, PERMISSIONS.TIME_APPROVE);
  const input = parseOrThrow(approveTimesheetSchema.safeParse(rawInput));

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const sheet = await findTimesheetByIdForUpdate(tx, context.organizationId, input.timesheetId);
    if (!sheet || sheet.archivedAt) throw new NotFoundError('Timesheet');
    await assertNotSelfTimeApproval(txContext, sheet.employeeId);

    if (sheet.status === 'approved') {
      const entries = await listTimeEntries(tx, context.organizationId, {
        timesheetId: sheet.id,
        status: 'recorded',
        approvalStatus: 'approved',
      });
      return { timesheet: sheet, entries };
    }

    assertTimesheetTransition(sheet.status, 'approved');

    const periodEntries = await listRecordedEntriesInPeriod(
      tx,
      context.organizationId,
      sheet.employeeId,
      sheet.periodStart,
      sheet.periodEnd,
    );
    const submitted = periodEntries.filter(
      (entry) => entry.approvalStatus === 'submitted' && entry.timesheetId === sheet.id,
    );

    const now = new Date();
    const updatedEntries = await updateEntriesApproval(tx, context.organizationId, {
      timeEntryIds: submitted.map((entry) => entry.id),
      fromStatuses: ['submitted'],
      approvalStatus: 'approved',
      timesheetId: sheet.id,
      decidedAt: now,
      decidedByUserId: context.userId,
    });

    const updatedSheet = await updateTimesheetLifecycle(
      tx,
      context.organizationId,
      sheet.id,
      {
        status: 'approved',
        decidedAt: now,
        decidedByUserId: context.userId,
        lockedAt: now,
      },
      { fromStatuses: ['submitted'] },
    );
    if (!updatedSheet) throwTimesheetRace();

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.TIMESHEET_APPROVED,
      entityType: 'timesheet',
      entityId: updatedSheet.id,
      after: {
        status: 'approved',
        lockedAt: now.toISOString(),
        entryIds: updatedEntries.map((entry) => entry.id),
      },
    });

    const { captureBrandSnapshot } = await import('@/modules/branding');
    await captureBrandSnapshot(txContext, {
      entityType: 'timesheet',
      entityId: updatedSheet.id,
    });

    return { timesheet: updatedSheet, entries: updatedEntries };
  });
}

export async function approveTimeEntry(
  context: OrgContext,
  rawInput: ApproveTimeEntryInput,
): Promise<TimeEntryRecord> {
  assertPermission(context, PERMISSIONS.TIME_APPROVE);
  const input = parseOrThrow(approveTimeEntrySchema.safeParse(rawInput));
  const entry = await findTimeEntryById(context.db, context.organizationId, input.timeEntryId);
  if (!entry || entry.archivedAt) throw new NotFoundError('Time entry');
  if (entry.status !== 'recorded') {
    throw new DomainRuleError('Time entry is void', 'workforce.errors.timeEntryAlreadyVoid');
  }
  if (entry.approvalStatus === 'approved') return entry;

  await assertNotSelfTimeApproval(context, entry.employeeId);
  assertTimeApprovalTransition(entry.approvalStatus, 'approved');

  const now = new Date();
  const [updated] = await updateEntriesApproval(context.db, context.organizationId, {
    timeEntryIds: [entry.id],
    fromStatuses: ['submitted'],
    approvalStatus: 'approved',
    decidedAt: now,
    decidedByUserId: context.userId,
  });
  if (!updated) {
    throw new DomainRuleError(
      'Only submitted time entries can be approved',
      'workforce.errors.invalidTimesheetTransition',
    );
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_APPROVED,
    entityType: 'time_entry',
    entityId: updated.id,
    after: { approvalStatus: 'approved' },
  });

  return updated;
}

/**
 * Bulk approve submitted rows in the same org. Already-approved ids are skipped
 * (idempotent). Non-submitted ids are skipped, not an error.
 */
export async function bulkApproveTimeEntries(
  context: OrgContext,
  rawInput: BulkApproveTimeEntriesInput,
): Promise<{
  readonly approved: readonly TimeEntryRecord[];
  readonly alreadyApprovedIds: readonly string[];
  readonly skippedIds: readonly string[];
}> {
  assertPermission(context, PERMISSIONS.TIME_APPROVE);
  const input = parseOrThrow(bulkApproveTimeEntriesSchema.safeParse(rawInput));
  const uniqueIds = [...new Set(input.timeEntryIds)];

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const rows = await listTimeEntriesByIds(tx, context.organizationId, uniqueIds);
    const foundIds = new Set(rows.map((row) => row.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) throw new NotFoundError('Time entry');

    for (const row of rows) {
      await assertNotSelfTimeApproval(txContext, row.employeeId);
    }

    const alreadyApprovedIds = rows
      .filter((row) => row.approvalStatus === 'approved' && row.status === 'recorded')
      .map((row) => row.id);
    const submittedIds = rows
      .filter((row) => row.approvalStatus === 'submitted' && row.status === 'recorded')
      .map((row) => row.id);
    const skippedIds = rows
      .filter(
        (row) =>
          row.status !== 'recorded' ||
          (row.approvalStatus !== 'submitted' && row.approvalStatus !== 'approved'),
      )
      .map((row) => row.id);

    const now = new Date();
    const approved =
      submittedIds.length === 0
        ? []
        : await updateEntriesApproval(tx, context.organizationId, {
            timeEntryIds: submittedIds,
            fromStatuses: ['submitted'],
            approvalStatus: 'approved',
            decidedAt: now,
            decidedByUserId: context.userId,
          });

    const timesheetIds = [
      ...new Set(
        approved
          .map((entry) => entry.timesheetId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    for (const timesheetId of timesheetIds) {
      const sheet = await findTimesheetByIdForUpdate(tx, context.organizationId, timesheetId);
      if (!sheet || sheet.status === 'approved') continue;
      if (sheet.status !== 'submitted') continue;
      const remaining = await listRecordedEntriesInPeriod(
        tx,
        context.organizationId,
        sheet.employeeId,
        sheet.periodStart,
        sheet.periodEnd,
      );
      const stillOpen = remaining.some(
        (entry) =>
          entry.timesheetId === sheet.id &&
          entry.approvalStatus === 'submitted',
      );
      if (!stillOpen) {
        const closed = await updateTimesheetLifecycle(
          tx,
          context.organizationId,
          sheet.id,
          {
            status: 'approved',
            decidedAt: now,
            decidedByUserId: context.userId,
            lockedAt: now,
          },
          { fromStatuses: ['submitted'] },
        );
        if (!closed) throwTimesheetRace();
      }
    }

    if (approved.length > 0) {
      await recordAuditEvent(txContext, {
        action: AUDIT_ACTIONS.TIME_ENTRY_BULK_APPROVED,
        entityType: 'time_entry',
        entityId: approved[0]!.id,
        after: {
          approvedIds: approved.map((entry) => entry.id),
          alreadyApprovedIds,
          skippedIds,
        },
      });
    }

    return { approved, alreadyApprovedIds, skippedIds };
  });
}

export function canApproveTime(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.TIME_APPROVE);
}

export type { TimeApprovalStatus };
