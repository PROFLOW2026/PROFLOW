import { sql } from 'drizzle-orm';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { money, toNumericString } from '@/shared/money';
import { noteModuleUsage } from '@/modules/tenancy/application/module-visibility';
import {
  formatCompletenessPercent,
  isCompletenessReady,
  scoreCompleteness,
} from '../domain/completeness';
import {
  assertCanTransitionMonthClose,
  assertPeriodClosed,
  assertPeriodNotClosed,
  closedPeriodSourceRewriteError,
} from '../domain/period-state';
import { isEconomicAdjustment } from '../domain/economic-corrections';
import type {
  CompletenessSnapshot,
  MonthCloseAdjustment,
  MonthClosePeriod,
  MonthCloseProjectOption,
} from '../domain/types';
import { assertYearMonth, currentYearMonth } from '../domain/year-month';
import { gatherCompletenessSignals } from '../data/completeness.repository';
import {
  findAdjustmentById,
  findPeriodById,
  findPeriodByYearMonth,
  findProjectInOrg,
  findSupersedingAdjustment,
  insertMonthCloseAdjustment,
  insertMonthClosePeriod,
  listAdjustmentsForPeriod,
  listMonthClosePeriods,
  listProjectOptionsForOrg,
  updatePeriodCompleteness,
  updatePeriodStatus,
} from '../data/periods.repository';
import {
  closePeriodSchema,
  createAdjustmentSchema,
  demoteToOpenSchema,
  ensurePeriodSchema,
  listPeriodsSchema,
  markReadySchema,
  type ClosePeriodInput,
  type CreateAdjustmentInput,
  type CreateAdjustmentParsed,
  type DemoteToOpenInput,
  type EnsurePeriodInput,
  type ListPeriodsInput,
  type MarkReadyInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } },
  raw: unknown,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

async function computeSnapshot(
  context: OrgContext,
  yearMonth: string,
): Promise<CompletenessSnapshot> {
  const signals = await gatherCompletenessSignals(
    context.db,
    context.organizationId,
    yearMonth,
  );
  return scoreCompleteness(signals, { yearMonth });
}

export async function listMonthCloseWorkspace(
  context: OrgContext,
  rawInput: ListPeriodsInput = {},
): Promise<{
  readonly periods: readonly MonthClosePeriod[];
  readonly canManage: boolean;
  readonly suggestedYearMonth: string;
  readonly projectOptions: readonly MonthCloseProjectOption[];
  readonly baseCurrency: string;
}> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_READ);
  const input = parseOrThrow(listPeriodsSchema, rawInput);
  const canManage = hasPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE);
  const [periods, projectOptions] = await Promise.all([
    listMonthClosePeriods(context.db, context.organizationId, input.limit ?? 18),
    canManage
      ? listProjectOptionsForOrg(context.db, context.organizationId)
      : Promise.resolve([] as MonthCloseProjectOption[]),
  ]);
  return {
    periods,
    canManage,
    suggestedYearMonth: currentYearMonth(context.organization.timezone),
    projectOptions,
    baseCurrency: context.organization.baseCurrency,
  };
}

export async function getMonthClosePeriodDetail(
  context: OrgContext,
  periodId: string,
): Promise<{
  readonly period: MonthClosePeriod;
  readonly adjustments: readonly MonthCloseAdjustment[];
  readonly canManage: boolean;
}> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_READ);
  const period = await findPeriodById(context.db, context.organizationId, periodId);
  if (!period) throw new NotFoundError('Month close period');
  const adjustments = await listAdjustmentsForPeriod(
    context.db,
    context.organizationId,
    period.id,
  );
  return {
    period,
    adjustments,
    canManage: hasPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE),
  };
}

export async function ensureMonthClosePeriod(
  context: OrgContext,
  rawInput: EnsurePeriodInput,
): Promise<MonthClosePeriod> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE);
  const input = parseOrThrow(ensurePeriodSchema, rawInput);
  const yearMonth = assertYearMonth(input.yearMonth);

  const existing = await findPeriodByYearMonth(
    context.db,
    context.organizationId,
    yearMonth,
  );
  if (existing) {
    return refreshPeriodCompleteness(context, existing.id);
  }

  const snapshot = await computeSnapshot(context, yearMonth);
  const period = await insertMonthClosePeriod(context.db, {
    organizationId: context.organizationId,
    yearMonth,
    notes: input.notes ?? null,
    completenessPercent: formatCompletenessPercent(snapshot.percent),
    completenessSnapshot: snapshot,
  });

  await noteModuleUsage(context.db, context.organizationId, 'month_close');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MONTH_CLOSE_PERIOD_OPENED,
    entityType: 'month_close_period',
    entityId: period.id,
    after: { yearMonth, status: 'open', completenessPercent: snapshot.percent },
  });

  return period;
}

export async function refreshPeriodCompleteness(
  context: OrgContext,
  periodId: string,
): Promise<MonthClosePeriod> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_READ);
  const period = await findPeriodById(context.db, context.organizationId, periodId);
  if (!period) throw new NotFoundError('Month close period');
  assertPeriodNotClosed(period.status);

  const snapshot = await computeSnapshot(context, period.yearMonth);
  const updated = await updatePeriodCompleteness(
    context.db,
    context.organizationId,
    period.id,
    formatCompletenessPercent(snapshot.percent),
    snapshot,
  );
  if (!updated) throw new NotFoundError('Month close period');
  return updated;
}

export async function markMonthCloseReady(
  context: OrgContext,
  rawInput: MarkReadyInput,
): Promise<MonthClosePeriod> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE);
  const input = parseOrThrow(markReadySchema, rawInput);
  const period = await findPeriodById(context.db, context.organizationId, input.periodId);
  if (!period) throw new NotFoundError('Month close period');
  assertCanTransitionMonthClose(period.status, 'ready');

  const snapshot = await computeSnapshot(context, period.yearMonth);
  if (!isCompletenessReady(snapshot)) {
    throw new DomainRuleError(
      'Completeness must be 100% before marking ready',
      'monthClose.errors.notComplete',
      { percent: snapshot.percent },
    );
  }

  const updated = await updatePeriodStatus(context.db, context.organizationId, period.id, {
    status: 'ready',
    completenessPercent: formatCompletenessPercent(snapshot.percent),
    completenessSnapshot: snapshot,
  });
  if (!updated) throw new NotFoundError('Month close period');

  await noteModuleUsage(context.db, context.organizationId, 'month_close');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MONTH_CLOSE_PERIOD_READY,
    entityType: 'month_close_period',
    entityId: period.id,
    after: { yearMonth: period.yearMonth, status: 'ready', completenessPercent: snapshot.percent },
  });

  return updated;
}

export async function demoteMonthCloseToOpen(
  context: OrgContext,
  rawInput: DemoteToOpenInput,
): Promise<MonthClosePeriod> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE);
  const input = parseOrThrow(demoteToOpenSchema, rawInput);
  const period = await findPeriodById(context.db, context.organizationId, input.periodId);
  if (!period) throw new NotFoundError('Month close period');
  assertCanTransitionMonthClose(period.status, 'open');

  const snapshot = await computeSnapshot(context, period.yearMonth);
  const updated = await updatePeriodStatus(context.db, context.organizationId, period.id, {
    status: 'open',
    completenessPercent: formatCompletenessPercent(snapshot.percent),
    completenessSnapshot: snapshot,
  });
  if (!updated) throw new NotFoundError('Month close period');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MONTH_CLOSE_PERIOD_REOPENED,
    entityType: 'month_close_period',
    entityId: period.id,
    after: { yearMonth: period.yearMonth, status: 'open' },
  });

  return updated;
}

export async function closeMonthClosePeriod(
  context: OrgContext,
  rawInput: ClosePeriodInput,
): Promise<MonthClosePeriod> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE);
  const input = parseOrThrow(closePeriodSchema, rawInput);
  const period = await findPeriodById(context.db, context.organizationId, input.periodId);
  if (!period) throw new NotFoundError('Month close period');
  assertCanTransitionMonthClose(period.status, 'closed');

  const snapshot = await computeSnapshot(context, period.yearMonth);
  if (!isCompletenessReady(snapshot)) {
    throw new DomainRuleError(
      'Completeness must remain 100% to close',
      'monthClose.errors.notComplete',
      { percent: snapshot.percent },
    );
  }

  const updated = await updatePeriodStatus(context.db, context.organizationId, period.id, {
    status: 'closed',
    closedAt: new Date(),
    closedByUserId: context.userId,
    notes: input.notes === undefined ? period.notes : input.notes,
    completenessPercent: formatCompletenessPercent(snapshot.percent),
    completenessSnapshot: snapshot,
  });
  if (!updated) throw new NotFoundError('Month close period');

  await noteModuleUsage(context.db, context.organizationId, 'month_close');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MONTH_CLOSE_PERIOD_CLOSED,
    entityType: 'month_close_period',
    entityId: period.id,
    after: {
      yearMonth: period.yearMonth,
      status: 'closed',
      completenessPercent: snapshot.percent,
    },
  });

  return updated;
}

export async function createMonthCloseAdjustment(
  context: OrgContext,
  rawInput: CreateAdjustmentInput,
): Promise<MonthCloseAdjustment> {
  assertPermission(context, PERMISSIONS.MONTH_CLOSE_MANAGE);
  const input = parseOrThrow(createAdjustmentSchema, rawInput);
  const period = await findPeriodById(context.db, context.organizationId, input.periodId);
  if (!period) throw new NotFoundError('Month close period');
  assertPeriodClosed(period.status);
  return persistMonthCloseAdjustment(context, period, input);
}

/**
 * Closed-period economic correction from a source module (time / similar).
 * Caller must already be authorized for the source action. Does not require
 * month_close.manage - rewriting the source is illegal; this is the only legal path.
 */
export async function createClosedPeriodSourceCorrection(
  context: OrgContext,
  rawInput: {
    readonly yearMonth: string;
    readonly reason: string;
    readonly amount: string;
    readonly currency: string;
    readonly effectSide: 'cost' | 'revenue';
    readonly projectId: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly adjustmentType?: 'correction' | 'adjustment';
  },
): Promise<MonthCloseAdjustment> {
  const yearMonth = assertYearMonth(rawInput.yearMonth);
  const period = await findPeriodByYearMonth(
    context.db,
    context.organizationId,
    yearMonth,
  );
  if (!period) {
    throw new DomainRuleError(
      'Closed-period corrections require a closed month-close period',
      'monthClose.errors.notClosed',
      { yearMonth },
    );
  }
  assertPeriodClosed(period.status);

  const input = parseOrThrow(createAdjustmentSchema, {
    periodId: period.id,
    adjustmentType: rawInput.adjustmentType ?? 'correction',
    reason: rawInput.reason,
    amount: rawInput.amount,
    currency: rawInput.currency,
    effectSide: rawInput.effectSide,
    projectId: rawInput.projectId,
    entityType: rawInput.entityType,
    entityId: rawInput.entityId,
  });
  return persistMonthCloseAdjustment(context, period, input);
}

async function persistMonthCloseAdjustment(
  context: OrgContext,
  period: MonthClosePeriod,
  input: CreateAdjustmentParsed,
): Promise<MonthCloseAdjustment> {
  const isEconomic = input.amount != null;
  let amount: string | null = null;
  let currency: string | null = null;
  const effectSide = isEconomic ? (input.effectSide ?? null) : null;
  const projectId = isEconomic ? (input.projectId ?? null) : null;

  if (isEconomic) {
    if (!projectId) throw new NotFoundError('Project');
    const project = await findProjectInOrg(context.db, context.organizationId, projectId);
    if (!project) throw new NotFoundError('Project');
    const projectCurrency = project.currency ?? context.organization.baseCurrency;
    currency = input.currency ?? projectCurrency;
    if (projectCurrency !== currency) {
      throw new DomainRuleError(
        'Economic corrections must use the project currency',
        'monthClose.errors.currencyMismatch',
        { currency, projectCurrency },
      );
    }
    amount = toNumericString(money(input.amount!, currency));
  }

  let supersedesAdjustmentId = isEconomic ? (input.supersedesAdjustmentId ?? null) : null;
  let adjustmentType = input.adjustmentType;
  if (supersedesAdjustmentId) {
    adjustmentType = 'supersede';
    const target = await findAdjustmentById(
      context.db,
      context.organizationId,
      supersedesAdjustmentId,
    );
    if (!target) throw new NotFoundError('Month close adjustment');
    if (target.periodId !== period.id) {
      throw new DomainRuleError(
        'You can only supersede a correction in the same closed month',
        'monthClose.errors.supersedeWrongPeriod',
        { periodId: period.id, targetPeriodId: target.periodId },
      );
    }
    if (!isEconomicAdjustment(target)) {
      throw new DomainRuleError(
        'You can only supersede an economic correction that has an amount',
        'monthClose.errors.supersedeNotEconomic',
        { targetId: target.id },
      );
    }
    if (target.projectId !== projectId) {
      throw new DomainRuleError(
        'You can only supersede a correction on the same project',
        'monthClose.errors.supersedeWrongProject',
        { projectId, targetProjectId: target.projectId },
      );
    }
    if (target.effectSide !== effectSide) {
      throw new DomainRuleError(
        'You can only supersede a correction on the same economic side',
        'monthClose.errors.supersedeWrongSide',
        { effectSide, targetSide: target.effectSide },
      );
    }
    if (target.currency !== currency) {
      throw new DomainRuleError(
        'You can only supersede a correction in the same currency',
        'monthClose.errors.supersedeWrongCurrency',
        { currency, targetCurrency: target.currency },
      );
    }
    const existingSupersede = await findSupersedingAdjustment(
      context.db,
      context.organizationId,
      target.id,
    );
    if (existingSupersede) {
      throw new DomainRuleError(
        'That correction is already superseded',
        'monthClose.errors.alreadySuperseded',
        { targetId: target.id, existingId: existingSupersede.id },
      );
    }
  } else {
    supersedesAdjustmentId = null;
  }

  const adjustment = await insertMonthCloseAdjustment(context.db, {
    organizationId: context.organizationId,
    periodId: period.id,
    adjustmentType,
    reason: input.reason,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    amount,
    currency,
    effectSide,
    projectId,
    supersedesAdjustmentId,
    createdByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MONTH_CLOSE_ADJUSTMENT_CREATED,
    entityType: 'month_close_adjustment',
    entityId: adjustment.id,
    after: {
      periodId: period.id,
      yearMonth: period.yearMonth,
      adjustmentType: adjustment.adjustmentType,
      reason: adjustment.reason,
      entityType: adjustment.entityType,
      entityId: adjustment.entityId,
      amount: adjustment.amount,
      currency: adjustment.currency,
      effectSide: adjustment.effectSide,
      projectId: adjustment.projectId,
      supersedesAdjustmentId: adjustment.supersedesAdjustmentId,
    },
  });

  return adjustment;
}

function closedFlag(result: unknown): boolean {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<{ closed?: boolean | null }> }).rows ?? []);
  return Boolean(rows[0]?.closed);
}

/**
 * Guard for other modules: refuse silent rewrite of a CLOSED operational month.
 * Call before mutating employer cost / allocations / AP allocations / expenses
 * dated in `yearMonth` when the month_close module is in use.
 *
 * Uses `app.is_month_closed` (SECURITY DEFINER, boolean only) so domain actors
 * without month_close.read cannot SELECT completeness snapshots via RLS.
 */
export async function assertMonthOpenForRewrite(
  context: OrgContext,
  yearMonth: string,
): Promise<void> {
  if (await isMonthClosed(context, yearMonth)) {
    throw closedPeriodSourceRewriteError();
  }
}

export async function isMonthClosed(
  context: OrgContext,
  yearMonth: string,
): Promise<boolean> {
  const ym = assertYearMonth(yearMonth);
  const result = await context.db.execute(sql`
    SELECT app.is_month_closed(${context.organizationId}::uuid, ${ym}) AS closed
  `);
  return closedFlag(result);
}
