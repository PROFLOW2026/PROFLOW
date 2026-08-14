import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { fromNumericString, subtractMoney, toNumericString, zeroMoney } from '@/shared/money';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission } from '@/shared/permissions/assert';
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
import { expandBulkWorkDates } from '../domain/bulk-time-expand';
import { calculateLaborCostTotal } from '../domain/labor-cost';
import { resolveRateVersionForDate } from '../domain/rate-lookup';
import { resolveTimeCorrectionApprovalAmount } from '../domain/time-correction-approval';
import { DEFAULT_NON_PROJECT_TIME_CODES } from '../domain/types';
import { findEmployeeById, findEmployeeByUserId } from '../data/employees.repository';
import {
  findDefaultWorkPackage,
  findPhaseById,
  findProjectById,
  findWorkPackageById,
} from '../data/project-refs.repository';
import {
  listComponentsByRateVersion,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import {
  countNonProjectTimeCodes,
  findNonProjectTimeCodeById,
  findTimeEntryById,
  insertNonProjectTimeCode,
  insertTimeEntry,
  listNonProjectTimeCodes,
  listTimeEntries,
  sumProjectLaborCost,
  voidTimeEntryRow,
} from '../data/time-entries.repository';
import type {
  NonProjectTimeCodeRecord,
  TimeEntryKind,
  TimeEntryListItem,
  TimeEntryRecord,
} from '../domain/types';
import {
  correctTimeEntrySchema,
  createBulkTimeEntriesSchema,
  createTimeEntrySchema,
  type CorrectTimeEntryInput,
  type CreateBulkTimeEntriesInput,
  type CreateTimeEntryInput,
  type TimeEntryFiltersInput,
} from '../validation/schemas';

export interface CostSnapshot {
  readonly rateVersionId: string | null;
  readonly costAmount: string | null;
  readonly costCurrency: string | null;
}

/**
 * Resolves and calculates the labor cost snapshot for a time entry (doc 04 §13, doc 06 §5).
 * Returns null cost fields when no rate applies on the work date.
 */
export async function resolveTimeEntryCostSnapshot(
  db: OrgContext['db'],
  organizationId: string,
  input: { employeeId: string; workDate: string; hours: string },
): Promise<CostSnapshot> {
  const versions = await listRateVersionsByEmployee(db, organizationId, input.employeeId);
  const rateVersion = resolveRateVersionForDate(versions, businessDate(input.workDate));

  if (!rateVersion) {
    return { rateVersionId: null, costAmount: null, costCurrency: null };
  }

  const components = await listComponentsByRateVersion(db, organizationId, rateVersion.id);
  const total = calculateLaborCostTotal({
    baseRate: rateVersion.baseRate,
    currency: rateVersion.currency,
    rateUnit: rateVersion.rateUnit,
    hours: input.hours,
    burdenPercent: rateVersion.burdenPercent,
    components,
  });

  return {
    rateVersionId: rateVersion.id,
    costAmount: toNumericString(total),
    costCurrency: total.currency,
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
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  await ensureDefaultTimeCodes(context.db, context.organizationId);
  return listNonProjectTimeCodes(context.db, context.organizationId);
}

export async function listTimeEntriesForOrg(
  context: OrgContext,
  filters: TimeEntryFiltersInput = {},
): Promise<TimeEntryListItem[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);
  return listTimeEntries(context.db, context.organizationId, {
    employeeId: filters.employeeId,
    projectId: filters.projectId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    kind: filters.kind ?? 'all',
    status: filters.status ?? 'recorded',
  });
}

export async function listProjectTimeEntries(
  context: OrgContext,
  projectId: string,
): Promise<TimeEntryListItem[]> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_READ, PERMISSIONS.PROJECTS_READ]);
  return listTimeEntries(context.db, context.organizationId, {
    projectId,
    kind: 'project',
    status: 'recorded',
  });
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
  });
}

export async function createTimeEntry(
  context: OrgContext,
  rawInput: CreateTimeEntryInput,
): Promise<TimeEntryRecord> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = createTimeEntrySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(input.workDate));

  const targets = await resolveTimeTargets(context, input);
  const entry = await insertRecordedTimeEntry(context, {
    employeeId: input.employeeId,
    workDate: input.workDate,
    hours: input.hours,
    kind: input.kind,
    targets,
    description: input.description,
  });

  await noteModuleUsage(context.db, context.organizationId, 'workforce');

  await recordAuditEvent(context, {
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
    },
  });

  return entry;
}

/**
 * Insert many day rows sharing one `bulk_batch_id`.
 * Expansion is pure (weekdays / per-day hours); each row snapshots cost independently.
 */
export async function createBulkTimeEntries(
  context: OrgContext,
  rawInput: CreateBulkTimeEntriesInput,
): Promise<{ readonly batchId: string; readonly entries: readonly TimeEntryRecord[] }> {
  assertPermission(context, PERMISSIONS.TIME_MANAGE);

  const parsed = createBulkTimeEntriesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
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

  const months = new Set(days.map((day) => yearMonthFromBusinessDate(day.workDate)));
  for (const yearMonth of months) {
    await assertMonthOpenForRewrite(context, yearMonth);
  }

  const targets = await resolveTimeTargets(context, input);
  const batchId = randomUUID();

  const entries = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const created: TimeEntryRecord[] = [];
    for (const day of days) {
      const entry = await insertRecordedTimeEntry(txContext, {
        employeeId: input.employeeId,
        workDate: day.workDate,
        hours: day.hours,
        kind: input.kind,
        targets,
        description: input.description,
        bulkBatchId: batchId,
      });
      created.push(entry);
    }
    return created;
  });

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
      entryCount: entries.length,
      kind: input.kind,
      projectId: targets.projectId,
      timeCodeId: targets.timeCodeId,
      entryIds: entries.map((entry) => entry.id),
    },
  });

  return { batchId, entries };
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

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');

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
    });

    return { voided, replacement };
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

  return { mode: 'void_replace', ...result };
}

/** Suggested default employee when the signed-in user is linked to one. */
export async function suggestDefaultEmployee(context: OrgContext): Promise<string | null> {
  const linked = await findEmployeeByUserId(context.db, context.organizationId, context.userId);
  return linked?.id ?? null;
}

export { sumProjectLaborCost };
