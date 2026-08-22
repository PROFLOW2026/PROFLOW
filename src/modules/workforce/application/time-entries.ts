import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { fromNumericString, subtractMoney, toNumericString, zeroMoney } from '@/shared/money';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { assertApprovalAllowsAction } from '@/modules/approvals';
import {
  assertMonthOpenForRewrite,
  createClosedPeriodSourceCorrection,
  isMonthClosed,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertCanAccessProject,
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import { canReadWorkforceCost } from './workforce-cost-authz';
import { assertCanActOnEmployeeTime, assertCanListTime, assertNotSelfTimeApproval, canReadOrgWorkforce, resolveSelfScopedEmployeeId } from './time-scope';
import { expandBulkWorkDates } from '../domain/bulk-time-expand';
import {
  parseKnownMonthlyEmployerCost,
  resolveLaborCostFromCompensation,
  type LaborCostResolutionKind,
} from '../domain/compensation-labor-cost';
import { planExactDuplicateDraftRemovals } from '../domain/duplicate-draft-cleanup';
import { resolveRateVersionForCosting } from '../domain/rate-lookup';
import { resolveTimeCorrectionApprovalAmount } from '../domain/time-correction-approval';
import {
  assertTimeEntryHoursEditable,
  isApprovedRecordedLocked,
} from '../domain/timesheet-lifecycle';
import { DEFAULT_NON_PROJECT_TIME_CODES } from '../domain/types';
import { findEmployeeMonthCostByEmployeeMonth } from '../data/employee-month-costs.repository';
import { findEmployeeById, findEmployeeByUserId } from '../data/employees.repository';
import {
  findDefaultWorkPackage,
  findPhaseById,
  findProjectById,
  findWorkPackageById,
  listActiveProjects,
} from '../data/project-refs.repository';
import {
  listComponentsByRateVersion,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import {
  countNonProjectTimeCodes,
  deleteDraftTimeEntryById,
  findNonProjectTimeCodeById,
  findTimeEntryById,
  insertNonProjectTimeCode,
  insertTimeEntry,
  listNonProjectTimeCodes,
  listTimeEntries,
  sumProjectLaborCost,
  voidTimeEntryRow,
} from '../data/time-entries.repository';
import { findTimesheetById, patchMutableTimeEntry } from '../data/timesheets.repository';
import { ensureValidClientRequestId } from '../domain/client-request-id';
import {
  assertTimeEntryIntegrity,
  findIdempotentTimeEntry,
  reconcileDailyExcessForEmployeeDate,
} from './time-entry-integrity';
import { refreshTimeEntryCostSnapshotIfMissing } from './time-entry-cost-reconcile';
import { resolveEmployeeWorkCalendarForCosting } from './work-calendar-context';
import type {
  NonProjectTimeCodeRecord,
  TimeApprovalStatus,
  TimeEntryKind,
  TimeEntryListItem,
  TimeEntryRecord,
} from '../domain/types';
import {
  correctTimeEntrySchema,
  createBulkTimeEntriesSchema,
  createTimeEntrySchema,
  updateTimeEntrySchema,
  type CorrectTimeEntryInput,
  type CreateBulkTimeEntriesInput,
  type CreateTimeEntryInput,
  type TimeEntryFiltersInput,
  type UpdateTimeEntryInput,
} from '../validation/schemas';

export interface CostSnapshot {
  readonly rateVersionId: string | null;
  readonly costAmount: string | null;
  readonly costCurrency: string | null;
  readonly resolutionKind?: LaborCostResolutionKind;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

/**
 * Resolves labor cost snapshot for a time entry.
 * Hourly → entry snapshot. Daily/monthly → null here; conserved paths fill later.
 */
export async function resolveTimeEntryCostSnapshot(
  db: OrgContext['db'],
  organizationId: string,
  input: { employeeId: string; workDate: string; hours: string },
): Promise<CostSnapshot> {
  const costing = await resolveEmployeeWorkCalendarForCosting(db, organizationId, input.employeeId);
  const calendar = costing.configured ? costing.rates : null;
  const versions = await listRateVersionsByEmployee(db, organizationId, input.employeeId);
  const rateVersion = resolveRateVersionForCosting(versions, businessDate(input.workDate));
  const components = rateVersion
    ? await listComponentsByRateVersion(db, organizationId, rateVersion.id)
    : [];

  const yearMonth = input.workDate.slice(0, 7);
  const monthCostRow = await findEmployeeMonthCostByEmployeeMonth(
    db,
    organizationId,
    input.employeeId,
    yearMonth,
  );
  const monthlyEmployerCost = monthCostRow
    ? parseKnownMonthlyEmployerCost({
        knownAmount: monthCostRow.knownAmount,
        currency: monthCostRow.currency,
      })
    : null;

  const resolution = resolveLaborCostFromCompensation({
    hours: input.hours,
    calendar,
    rateVersion: rateVersion
      ? {
          id: rateVersion.id,
          baseRate: rateVersion.baseRate,
          currency: rateVersion.currency,
          rateUnit: rateVersion.rateUnit,
          burdenPercent: rateVersion.burdenPercent,
        }
      : null,
    components,
    monthlyEmployerCost,
  });

  return {
    rateVersionId: resolution.rateVersionId,
    costAmount: resolution.costAmount,
    costCurrency: resolution.costCurrency,
    resolutionKind: resolution.kind,
  };
}

async function ensureDefaultTimeCodes(db: OrgContext['db'], organizationId: string): Promise<void> {
  const count = await countNonProjectTimeCodes(db, organizationId);
  if (count > 0) return;

  for (const preset of DEFAULT_NON_PROJECT_TIME_CODES) {
    await insertNonProjectTimeCode(db, {
      organizationId,
      key: preset.key,
      name: preset.name,
    });
  }
}

export async function listNonProjectCodes(context: OrgContext): Promise<NonProjectTimeCodeRecord[]> {
  assertAnyPermission(context, [PERMISSIONS.TIME_MANAGE, PERMISSIONS.WORKFORCE_READ]);
  await ensureDefaultTimeCodes(context.db, context.organizationId);
  return listNonProjectTimeCodes(context.db, context.organizationId);
}

function redactTimeEntryCost<T extends { costAmount: string | null; costCurrency: string | null }>(
  entry: T,
  canReadCost: boolean,
): T {
  if (canReadCost) return entry;
  return { ...entry, costAmount: null, costCurrency: null };
}

export async function listTimeEntriesForOrg(
  context: OrgContext,
  filters: TimeEntryFiltersInput = {},
): Promise<TimeEntryListItem[]> {
  assertCanListTime(context);
  let scopedEmployeeId = filters.employeeId;
  if (!canReadOrgWorkforce(context)) {
    const linkedId = await resolveSelfScopedEmployeeId(context);
    if (!linkedId) return [];
    if (filters.employeeId && filters.employeeId !== linkedId) {
      throw new DomainRuleError(
        'Time self scope is limited to the linked employee',
        'workforce.errors.timeSelfScope',
      );
    }
    scopedEmployeeId = linkedId;
  }
  if (filters.projectId) await assertCanAccessProject(context, filters.projectId);
  const rows = await listTimeEntries(context.db, context.organizationId, {
    employeeId: scopedEmployeeId,
    projectId: filters.projectId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    kind: filters.kind ?? 'all',
    status: filters.status ?? 'recorded',
    approvalStatus: filters.approvalStatus ?? 'all',
  });
  const allowed = await resolveAccessibleProjectIds(context);
  const canReadCost = canReadWorkforceCost(context);
  return rows
    .filter((row) => isAccessibleProjectId(allowed, row.projectId))
    .map((row) => redactTimeEntryCost(row, canReadCost));
}

export async function listProjectsForTimeLog(
  context: OrgContext,
): Promise<{ id: string; name: string }[]> {
  assertAnyPermission(context, [PERMISSIONS.TIME_MANAGE, PERMISSIONS.WORKFORCE_READ]);
  const projects = await listActiveProjects(context.db, context.organizationId);
  const allowed = await resolveAccessibleProjectIds(context);
  return projects.filter((project) => isAccessibleProjectId(allowed, project.id));
}

export async function listProjectTimeEntries(
  context: OrgContext,
  projectId: string,
): Promise<TimeEntryListItem[]> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.PROJECTS_READ]);
  await assertCanAccessProject(context, projectId);
  const rows = await listTimeEntries(context.db, context.organizationId, {
    projectId,
    kind: 'project',
    status: 'recorded',
  });
  const canReadCost = canReadWorkforceCost(context);
  return rows.map((row) => redactTimeEntryCost(row, canReadCost));
}

interface ResolvedTimeTargets {
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly phaseId: string | null;
  readonly timeCodeId: string | null;
}

async function resolveTimeTargets(
  context: OrgContext,
  input: {
    kind: TimeEntryKind;
    projectId?: string | null;
    workPackageId?: string | null;
    phaseId?: string | null;
    timeCodeId?: string | null;
  },
): Promise<ResolvedTimeTargets> {
  let projectId: string | null = null;
  let workPackageId: string | null = null;
  let phaseId: string | null = null;
  let timeCodeId: string | null = null;

  if (input.kind === 'project') {
    const project = await findProjectById(context.db, context.organizationId, input.projectId!);
    if (!project) throw new NotFoundError('Project');
    await assertCanAccessProject(context, project.id);

    projectId = project.id;

    if (input.workPackageId) {
      const workPackage = await findWorkPackageById(
        context.db,
        context.organizationId,
        input.workPackageId,
      );
      if (!workPackage || workPackage.projectId !== projectId) {
        throw new DomainRuleError(
          'Work area does not belong to the project',
          'workforce.errors.invalidWorkPackage',
        );
      }
      workPackageId = workPackage.id;
    } else {
      const defaultPackage = await findDefaultWorkPackage(
        context.db,
        context.organizationId,
        projectId,
      );
      workPackageId = defaultPackage?.id ?? null;
    }

    if (input.phaseId) {
      const phase = await findPhaseById(context.db, context.organizationId, input.phaseId);
      if (!phase || phase.projectId !== projectId) {
        throw new DomainRuleError(
          'Phase does not belong to the project',
          'workforce.errors.invalidPhase',
        );
      }
      if (workPackageId && phase.workPackageId !== workPackageId) {
        throw new DomainRuleError(
          'Phase does not belong to the work area',
          'workforce.errors.invalidPhase',
        );
      }
      phaseId = phase.id;
    }
  } else {
    await ensureDefaultTimeCodes(context.db, context.organizationId);
    const code = await findNonProjectTimeCodeById(
      context.db,
      context.organizationId,
      input.timeCodeId!,
    );
    if (!code) throw new NotFoundError('Time code');
    timeCodeId = code.id;
  }

  return { projectId, workPackageId, phaseId, timeCodeId };
}

async function insertRecordedTimeEntry(
  context: OrgContext,
  input: {
    employeeId: string;
    workDate: string;
    hours: string;
    kind: TimeEntryKind;
    targets: ResolvedTimeTargets;
    description?: string | null;
    correctsEntryId?: string | null;
    bulkBatchId?: string | null;
    snapshot?: CostSnapshot;
    excessHours?: string | null;
    excessApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
    clientRequestId?: string | null;
    /**
     * New logs: draft (no Actual). Corrections of approved history: approved
     * so Actual is not silently dropped - the time_correction gate still applies.
     */
    approvalStatus?: TimeApprovalStatus;
  },
): Promise<TimeEntryRecord> {
  const snapshot =
    input.snapshot ??
    (await resolveTimeEntryCostSnapshot(context.db, context.organizationId, {
      employeeId: input.employeeId,
      workDate: input.workDate,
      hours: input.hours,
    }));

  return insertTimeEntry(context.db, {
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    workDate: input.workDate,
    hours: input.hours,
    kind: input.kind,
    projectId: input.targets.projectId,
    workPackageId: input.targets.workPackageId,
    phaseId: input.targets.phaseId,
    timeCodeId: input.targets.timeCodeId,
    rateVersionId: snapshot.rateVersionId,
    costAmount: snapshot.costAmount,
    costCurrency: snapshot.costCurrency,
    description: input.description ?? null,
    createdByUserId: context.userId,
    status: 'recorded',
    correctsEntryId: input.correctsEntryId ?? null,
    bulkBatchId: input.bulkBatchId ?? null,
    approvalStatus: input.approvalStatus ?? 'draft',
    decidedAt: input.approvalStatus === 'approved' ? new Date() : null,
    decidedByUserId: input.approvalStatus === 'approved' ? context.userId : null,
    excessHours: input.excessHours ?? null,
    excessApprovalStatus: input.excessApprovalStatus ?? null,
    clientRequestId: input.clientRequestId ?? null,
  });
}

/**
 * New entries start as approval_status='draft' and do not create labor Actual.
 * Actors with time.approve are not auto-approved on create (safer default):
 * Actual waits for submit → approve.
 */
export async function createTimeEntry(
  context: OrgContext,
  rawInput: CreateTimeEntryInput,
  options?: { readonly skipCostRecompute?: boolean },
): Promise<TimeEntryRecord> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = createTimeEntrySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const clientRequestId = ensureValidClientRequestId(input.clientRequestId);
  const canApproveTime = hasPermission(context, PERMISSIONS.TIME_APPROVE);
  const confirmDailyExcess = input.confirmDailyExcess || canApproveTime;

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
  await assertCanActOnEmployeeTime(context, input.employeeId);

  if (input.approveOnCreate) {
    assertPermission(context, PERMISSIONS.TIME_APPROVE);
    await assertNotSelfTimeApproval(context, input.employeeId);
  }

  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(input.workDate));

  const targets = await resolveTimeTargets(context, input);

  const created = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };

    const idempotent = await findIdempotentTimeEntry(
      tx,
      context.organizationId,
      clientRequestId,
    );
    if (idempotent) return idempotent;

    await assertTimeEntryIntegrity(tx, context.organizationId, {
      employeeId: input.employeeId,
      workDate: input.workDate,
      hours: input.hours,
      kind: input.kind,
      projectId: targets.projectId,
      workPackageId: targets.workPackageId,
      phaseId: targets.phaseId,
      timeCodeId: targets.timeCodeId,
      description: input.description,
      clientRequestId,
      confirmDailyExcess,
    });

    let entry: TimeEntryRecord;
    try {
      entry = await insertRecordedTimeEntry(txContext, {
        employeeId: input.employeeId,
        workDate: input.workDate,
        hours: input.hours,
        kind: input.kind,
        targets,
        description: input.description,
        clientRequestId,
        approvalStatus: input.approveOnCreate ? 'approved' : undefined,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await findIdempotentTimeEntry(
          tx,
          context.organizationId,
          clientRequestId,
        );
        if (raced) return raced;
      }
      throw error;
    }

    await reconcileDailyExcessForEmployeeDate(
      tx,
      context.organizationId,
      input.employeeId,
      input.workDate,
    );

    const refreshed = await findTimeEntryById(tx, context.organizationId, entry.id);
    entry = refreshed ?? entry;
    const costRefreshed = await refreshTimeEntryCostSnapshotIfMissing(txContext, entry.id);
    entry = costRefreshed ?? entry;

    await noteModuleUsage(tx, context.organizationId, 'workforce');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.TIME_ENTRY_CREATED,
      entityType: 'time_entry',
      entityId: entry.id,
      after: {
        employeeId: entry.employeeId,
        workDate: entry.workDate,
        hours: entry.hours,
        kind: entry.kind,
        projectId: entry.projectId,
        timeCodeId: entry.timeCodeId,
        costAmount: entry.costAmount,
        costCurrency: entry.costCurrency,
        rateVersionId: entry.rateVersionId,
        status: entry.status,
        approvalStatus: entry.approvalStatus,
      },
    });

    return entry;
  });

  if (!options?.skipCostRecompute) {
    const { recomputeEmployeeCostsAfterTimeChange } = await import('./daily-cost-recompute');
    await recomputeEmployeeCostsAfterTimeChange(context, {
      employeeId: created.employeeId,
      workDates: [created.workDate],
    });
  }
  return created;
}

/**
 * Insert many day rows sharing one `bulk_batch_id`.
 * Expansion is pure (weekdays / per-day hours); each row snapshots cost independently.
 * Exact duplicates are skipped (not fatal) so historical bulk re-entry is practical.
 */
export async function createBulkTimeEntries(
  context: OrgContext,
  rawInput: CreateBulkTimeEntriesInput,
  options?: { readonly skipCostRecompute?: boolean },
): Promise<{
  readonly batchId: string;
  readonly entries: readonly TimeEntryRecord[];
  readonly skippedDuplicateCount: number;
}> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = createBulkTimeEntriesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const canApproveTime = hasPermission(context, PERMISSIONS.TIME_APPROVE);
  const confirmDailyExcess = input.confirmDailyExcess || canApproveTime;
  let days;
  try {
    days = expandBulkWorkDates({
      fromDate: input.fromDate,
      toDate: input.toDate,
      hours: input.hours,
      weekdays: input.weekdays,
      dayHours: input.dayHours,
    });
  } catch (error) {
    throw new DomainRuleError(
      error instanceof Error ? error.message : 'Invalid bulk range',
      'workforce.errors.invalidBulkRange',
    );
  }

  if (days.length === 0) {
    throw new DomainRuleError('No days matched the bulk filters', 'workforce.errors.emptyBulk');
  }

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
  await assertCanActOnEmployeeTime(context, input.employeeId);

  const months = new Set(days.map((day) => yearMonthFromBusinessDate(day.workDate)));
  for (const yearMonth of months) {
    await assertMonthOpenForRewrite(context, yearMonth);
  }

  const targets = await resolveTimeTargets(context, input);
  const batchId = randomUUID();

  const { created, skippedDuplicateCount } = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const createdRows: TimeEntryRecord[] = [];
    let skipped = 0;
    for (const day of days) {
      try {
        await assertTimeEntryIntegrity(tx, context.organizationId, {
          employeeId: input.employeeId,
          workDate: day.workDate,
          hours: day.hours,
          kind: input.kind,
          projectId: targets.projectId,
          workPackageId: targets.workPackageId,
          phaseId: targets.phaseId,
          timeCodeId: targets.timeCodeId,
          description: input.description,
          confirmDailyExcess,
        });
      } catch (error) {
        if (error instanceof ConflictError && error.messageKey === 'workforce.errors.exactDuplicateTimeEntry') {
          skipped += 1;
          continue;
        }
        throw error;
      }
      const entry = await insertRecordedTimeEntry(txContext, {
        employeeId: input.employeeId,
        workDate: day.workDate,
        hours: day.hours,
        kind: input.kind,
        targets,
        description: input.description,
        bulkBatchId: batchId,
        clientRequestId: ensureValidClientRequestId(null),
      });
      await reconcileDailyExcessForEmployeeDate(
        tx,
        context.organizationId,
        input.employeeId,
        day.workDate,
      );
      const refreshed = await findTimeEntryById(tx, context.organizationId, entry.id);
      createdRows.push(refreshed ?? entry);
    }
    return { created: createdRows, skippedDuplicateCount: skipped };
  });

  if (created.length === 0 && skippedDuplicateCount > 0) {
    throw new ConflictError(
      'All selected dates already have matching time entries',
      'workforce.errors.bulkAllDuplicates',
      { skippedDuplicateCount },
    );
  }

  if (created.length > 0) {
    await noteModuleUsage(context.db, context.organizationId, 'workforce');

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.TIME_ENTRY_BULK_CREATED,
      entityType: 'time_entry_batch',
      entityId: batchId,
      after: {
        bulkBatchId: batchId,
        employeeId: input.employeeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        entryCount: created.length,
        skippedDuplicateCount,
        kind: input.kind,
        projectId: targets.projectId,
        timeCodeId: targets.timeCodeId,
        entryIds: created.map((entry) => entry.id),
      },
    });

    if (!options?.skipCostRecompute) {
      const { recomputeEmployeeCostsAfterTimeChange } = await import('./daily-cost-recompute');
      await recomputeEmployeeCostsAfterTimeChange(context, {
        employeeId: input.employeeId,
        workDates: created.map((entry) => entry.workDate),
      });
    }
  }

  return { batchId, entries: created, skippedDuplicateCount };
}

/**
 * Optional `time_correction` gate. No matching rule → allow.
 * Matching rule without an approved request → submit (if missing) and block.
 * Labor Actual must not change until this returns.
 */
async function assertTimeCorrectionAllowed(
  context: OrgContext,
  input: {
    readonly originalEntryId: string;
    readonly hours: string;
    readonly snapshot: CostSnapshot;
  },
): Promise<void> {
  const approval = resolveTimeCorrectionApprovalAmount({
    costAmount: input.snapshot.costAmount,
    costCurrency: input.snapshot.costCurrency,
    hours: input.hours,
    orgBaseCurrency: context.organization.baseCurrency,
  });

  await assertApprovalAllowsAction(context, {
    entityType: 'time_correction',
    entityId: input.originalEntryId,
    amount: approval.amount,
    currency: approval.currency,
    submitIfMissing: true,
  });
}

export type CorrectTimeEntryResult =
  | {
      readonly mode: 'void_replace';
      readonly voided: TimeEntryRecord;
      readonly replacement: TimeEntryRecord;
    }
  | {
      readonly mode: 'closed_period_adjustment';
      readonly original: TimeEntryRecord;
      readonly adjustmentId: string;
    };

function laborCostDelta(
  original: TimeEntryRecord,
  snapshot: CostSnapshot,
  fallbackCurrency: string,
): { amount: string; currency: string } {
  const currency = snapshot.costCurrency ?? original.costCurrency ?? fallbackCurrency;
  const previous =
    fromNumericString(original.costAmount, original.costCurrency ?? currency) ??
    zeroMoney(currency);
  const next =
    fromNumericString(snapshot.costAmount, snapshot.costCurrency ?? currency) ??
    zeroMoney(currency);
  if (previous.currency !== next.currency) {
    throw new DomainRuleError(
      'Closed-month time correction requires the same cost currency',
      'workforce.errors.closedMonthCurrencyMismatch',
      { from: previous.currency, to: next.currency },
    );
  }
  const delta = subtractMoney(next, previous);
  return { amount: toNumericString(delta), currency: delta.currency };
}

/**
 * Correction: void the original (no silent overwrite) and insert a replacement
 * row with `corrects_entry_id` pointing at the voided original.
 * When a `time_correction` rule matches, Actual is unchanged until approved.
 *
 * Closed original month: the source row stays as historical truth. Economic
 * truth is original + a month-close cost adjustment for (new cost − old cost).
 */
export async function correctTimeEntry(
  context: OrgContext,
  rawInput: CorrectTimeEntryInput,
): Promise<CorrectTimeEntryResult> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = correctTimeEntrySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const original = await findTimeEntryById(
    context.db,
    context.organizationId,
    input.correctsEntryId,
  );
  if (!original) throw new NotFoundError('Time entry');
  if (original.status === 'void') {
    throw new DomainRuleError(
      'Time entry is already void',
      'workforce.errors.timeEntryAlreadyVoid',
    );
  }
  if (original.archivedAt) {
    throw new DomainRuleError(
      'Cannot correct an archived time entry',
      'workforce.errors.timeEntryArchived',
    );
  }
  await assertCanActOnEmployeeTime(context, original.employeeId);

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
  await assertCanActOnEmployeeTime(context, input.employeeId);

  const targets = await resolveTimeTargets(context, input);
  const snapshot = await resolveTimeEntryCostSnapshot(context.db, context.organizationId, {
    employeeId: input.employeeId,
    workDate: input.workDate,
    hours: input.hours,
  });

  await assertTimeCorrectionAllowed(context, {
    originalEntryId: original.id,
    hours: input.hours,
    snapshot,
  });

  const originalMonth = yearMonthFromBusinessDate(original.workDate);
  if (await isMonthClosed(context, originalMonth)) {
    const projectId = original.projectId ?? targets.projectId;
    if (!projectId) {
      throw new ConflictError(
        'Cannot record a closed-month economic correction without a project. Date a reversing time entry in an open month, or assign the original entry to a project.',
        'workforce.errors.closedMonthNeedsProject',
        { timeEntryId: original.id, yearMonth: originalMonth },
      );
    }

    const delta = laborCostDelta(original, snapshot, context.organization.baseCurrency);
    const adjustment = await createClosedPeriodSourceCorrection(context, {
      yearMonth: originalMonth,
      adjustmentType: 'correction',
      reason:
        `תיקון שעות בחודש סגור. רשומת מקור ${original.id} נשארת היסטורית (לא בוטלה). ` +
        `שעות ${original.hours}→${input.hours}.`,
      amount: delta.amount,
      currency: delta.currency,
      effectSide: 'cost',
      projectId,
      entityType: 'time_entry',
      entityId: original.id,
    });

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.TIME_ENTRY_CORRECTED,
      entityType: 'time_entry',
      entityId: original.id,
      after: {
        closedPeriod: true,
        sourceRewritten: false,
        monthCloseAdjustmentId: adjustment.id,
        hoursFrom: original.hours,
        hoursTo: input.hours,
        costDelta: delta.amount,
        costCurrency: delta.currency,
      },
    });

    return {
      mode: 'closed_period_adjustment',
      original,
      adjustmentId: adjustment.id,
    };
  }

  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(input.workDate));

  const voidedAt = new Date();

  const result = await withTransaction(context.db, async (tx) => {
    const voided = await voidTimeEntryRow(tx, context.organizationId, original.id, voidedAt);
    if (!voided) {
      throw new DomainRuleError(
        'Time entry could not be voided',
        'workforce.errors.timeEntryAlreadyVoid',
      );
    }

    const txContext = { ...context, db: tx };
    const replacement = await insertRecordedTimeEntry(txContext, {
      employeeId: input.employeeId,
      workDate: input.workDate,
      hours: input.hours,
      kind: input.kind,
      targets,
      description: input.description,
      correctsEntryId: original.id,
      snapshot,
      approvalStatus: original.approvalStatus === 'approved' ? 'approved' : 'draft',
      clientRequestId: ensureValidClientRequestId(input.clientRequestId),
    });

    await reconcileDailyExcessForEmployeeDate(
      tx,
      context.organizationId,
      input.employeeId,
      input.workDate,
    );
    if (original.workDate !== input.workDate) {
      await reconcileDailyExcessForEmployeeDate(
        tx,
        context.organizationId,
        original.employeeId,
        original.workDate,
      );
    }

    const refreshedReplacement =
      (await findTimeEntryById(tx, context.organizationId, replacement.id)) ?? replacement;

    return { voided, replacement: refreshedReplacement };
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_VOIDED,
    entityType: 'time_entry',
    entityId: result.voided.id,
    before: { status: 'recorded', hours: original.hours, workDate: original.workDate },
    after: { status: 'void', voidedAt: voidedAt.toISOString() },
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_CORRECTED,
    entityType: 'time_entry',
    entityId: result.replacement.id,
    after: {
      correctsEntryId: original.id,
      employeeId: result.replacement.employeeId,
      workDate: result.replacement.workDate,
      hours: result.replacement.hours,
      kind: result.replacement.kind,
      projectId: result.replacement.projectId,
      timeCodeId: result.replacement.timeCodeId,
      costAmount: result.replacement.costAmount,
      costCurrency: result.replacement.costCurrency,
    },
  });

  const { recomputeEmployeeCostsAfterTimeChange } = await import('./daily-cost-recompute');
  await recomputeEmployeeCostsAfterTimeChange(context, {
    employeeId: original.employeeId,
    workDates: [original.workDate, result.replacement.workDate],
  });

  return { mode: 'void_replace', ...result };
}

/**
 * Draft / returned hour edits. Approved recorded rows must use correctTimeEntry.
 */
export async function updateTimeEntry(
  context: OrgContext,
  rawInput: UpdateTimeEntryInput,
): Promise<TimeEntryRecord> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = updateTimeEntrySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const original = await findTimeEntryById(context.db, context.organizationId, input.timeEntryId);
  if (!original) throw new NotFoundError('Time entry');
  if (original.archivedAt) {
    throw new DomainRuleError(
      'Cannot correct an archived time entry',
      'workforce.errors.timeEntryArchived',
    );
  }
  await assertCanActOnEmployeeTime(context, original.employeeId);
  if (original.timesheetId) {
    const sheet = await findTimesheetById(context.db, context.organizationId, original.timesheetId);
    if (sheet?.lockedAt || sheet?.status === 'approved') {
      throw new DomainRuleError(
        'This timesheet period is locked; use a correction',
        'workforce.errors.timesheetPeriodLocked',
        { timesheetId: sheet.id },
      );
    }
  }
  if (isApprovedRecordedLocked(original)) {
    throw new DomainRuleError(
      'Approved time is locked; use a correction',
      'workforce.errors.timeEntryApprovedLocked',
    );
  }
  assertTimeEntryHoursEditable(original);

  let snapshot = {
    costAmount: original.costAmount,
    costCurrency: original.costCurrency,
    rateVersionId: original.rateVersionId,
  };
  if (input.hours && input.hours !== original.hours) {
    snapshot = await resolveTimeEntryCostSnapshot(context.db, context.organizationId, {
      employeeId: original.employeeId,
      workDate: original.workDate,
      hours: input.hours,
    });
  }

  const updated = await withTransaction(context.db, async (tx) => {
    const patched = await patchMutableTimeEntry(tx, context.organizationId, original.id, {
      hours: input.hours,
      description: input.description,
      costAmount: snapshot.costAmount,
      costCurrency: snapshot.costCurrency,
      rateVersionId: snapshot.rateVersionId,
    });
    if (!patched) {
      throw new DomainRuleError(
        'Approved time is locked; use a correction',
        'workforce.errors.timeEntryApprovedLocked',
      );
    }

    if (input.hours && input.hours !== original.hours) {
      await reconcileDailyExcessForEmployeeDate(
        tx,
        context.organizationId,
        original.employeeId,
        original.workDate,
      );
      return (await findTimeEntryById(tx, context.organizationId, patched.id)) ?? patched;
    }

    return patched;
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_UPDATED,
    entityType: 'time_entry',
    entityId: updated.id,
    before: { hours: original.hours, description: original.description },
    after: { hours: updated.hours, description: updated.description },
  });

  return updated;
}

/** Suggested default employee when the signed-in user is linked to one. */
export async function suggestDefaultEmployee(context: OrgContext): Promise<string | null> {
  const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
  return linked?.id ?? null;
}

/**
 * Permanently removes a draft time entry (unsubmitted only).
 * Approved/submitted rows must be voided via correction.
 */
export async function deleteDraftTimeEntry(
  context: OrgContext,
  rawInput: { readonly timeEntryId: string },
): Promise<TimeEntryRecord> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const entry = await findTimeEntryById(
    context.db,
    context.organizationId,
    rawInput.timeEntryId,
  );
  if (!entry) throw new NotFoundError('Time entry');
  if (entry.status === 'void') {
    throw new DomainRuleError(
      'Time entry is already void',
      'workforce.errors.timeEntryAlreadyVoid',
    );
  }
  if (entry.approvalStatus !== 'draft' && entry.approvalStatus !== 'returned') {
    throw new DomainRuleError(
      'Only draft or returned entries can be deleted',
      'workforce.errors.timeEntryNotDeletable',
    );
  }
  await assertCanActOnEmployeeTime(context, entry.employeeId);
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(entry.workDate));

  const deleted = await withTransaction(context.db, async (tx) => {
    const removed = await deleteDraftTimeEntryById(tx, context.organizationId, entry.id);
    if (!removed) {
      throw new DomainRuleError(
        'Time entry could not be deleted',
        'workforce.errors.timeEntryNotDeletable',
      );
    }
    await reconcileDailyExcessForEmployeeDate(
      tx,
      context.organizationId,
      removed.employeeId,
      removed.workDate,
    );
    return removed;
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TIME_ENTRY_DELETED,
    entityType: 'time_entry',
    entityId: deleted.id,
    before: {
      employeeId: deleted.employeeId,
      workDate: deleted.workDate,
      hours: deleted.hours,
      projectId: deleted.projectId,
    },
  });

  return deleted;
}

/**
 * Removes exact duplicate draft/returned rows, keeping the oldest in each group.
 * Never deletes approved history.
 */
export async function purgeExactDuplicateDrafts(
  context: OrgContext,
  filters: TimeEntryFiltersInput = {},
): Promise<{ readonly removedCount: number }> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const entries = await listTimeEntriesForOrg(context, {
    ...filters,
    status: 'recorded',
  });
  const plans = planExactDuplicateDraftRemovals(entries);
  let removedCount = 0;

  for (const plan of plans) {
    for (const timeEntryId of plan.removeIds) {
      await deleteDraftTimeEntry(context, { timeEntryId });
      removedCount += 1;
    }
  }

  return { removedCount };
}

export { sumProjectLaborCost };
