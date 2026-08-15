import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import { appendDailyLogCorrectionNote, packWorkforceAndBlockers } from '../domain/daily-log-notes';
import {
  assertDailyLogContentMutable,
  assertDailyLogStatusTransition,
  finalizedStamp,
  isDailyLogLocked,
  submittedStamp,
} from '../domain/daily-log-status';
import type { DailyLogStatus } from '../domain/types';
import {
  findActiveDailyLogByProjectDate,
  findDailyLogById,
  findDailyLogByIdForUpdate,
  insertDailyLog,
  listDailyLogs,
  updateDailyLogById,
} from '../data/field-ops.repository';
import {
  appendDailyLogCorrectionSchema,
  createDailyLogSchema,
  transitionDailyLogStatusSchema,
  updateDailyLogSchema,
  type AppendDailyLogCorrectionInput,
  type CreateDailyLogInput,
  type TransitionDailyLogStatusInput,
  type UpdateDailyLogInput,
} from '../validation/schemas';
import { assertProjectRefsInOrg } from './assert-project-refs';

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    if ((current as { code?: string }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function extraFieldsFromCreate(input: ReturnType<typeof createDailyLogSchema.parse>) {
  return {
    workPerformed: input.workPerformed ?? input.summary,
    delays: input.delays ?? null,
    incidents: input.incidents ?? null,
    safetyNotes: input.safetyNotes ?? null,
    visitorNotes: input.visitorNotes ?? null,
    managerNotes: input.managerNotes ?? null,
    workersOnSite: input.workersOnSite ?? null,
    subcontractorsOnSite: input.subcontractorsOnSite ?? null,
    equipmentOnSite: input.equipmentOnSite ?? null,
    deliveries: input.deliveries ?? null,
  };
}

export async function listDailyLogsForOrg(
  context: OrgContext,
  projectIdOrFilters?: string | { projectId?: string; status?: DailyLogStatus },
) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const [allowed, rows] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listDailyLogs(context.db, context.organizationId, projectIdOrFilters),
  ]);
  return rows.filter((row) => isAccessibleProjectId(allowed, row.projectId));
}

export async function getDailyLogForOrg(context: OrgContext, dailyLogId: string) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const log = await findDailyLogById(context.db, context.organizationId, dailyLogId);
  if (!log) throw new NotFoundError('Daily log');
  await assertCanAccessProject(context, log.projectId);
  return log;
}

export async function createDailyLog(context: OrgContext, raw: CreateDailyLogInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const input = parseOrThrow(createDailyLogSchema.safeParse(raw));

  await assertProjectRefsInOrg(context, {
    projectId: input.projectId,
    workPackageId: input.workPackageId,
  });

  const existing = await findActiveDailyLogByProjectDate(
    context.db,
    context.organizationId,
    input.projectId,
    input.logDate,
  );
  if (existing) {
    throw new ConflictError(
      'A daily log already exists for this project day',
      'fieldOps.errors.duplicateLogDate',
      { dailyLogId: existing.id },
    );
  }

  let log;
  try {
    log = await insertDailyLog(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      workPackageId: input.workPackageId ?? null,
      logDate: input.logDate,
      weather: input.weather ?? null,
      summary: input.summary,
      workforceNotes: packWorkforceAndBlockers(input.workforceNotes, input.blockers),
      status: 'draft',
      createdBy: context.userId,
      ...extraFieldsFromCreate(input),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'A daily log already exists for this project day',
        'fieldOps.errors.duplicateLogDate',
      );
    }
    throw error;
  }

  await noteModuleUsage(context.db, context.organizationId, 'field_ops');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DAILY_LOG_CREATED,
    entityType: 'daily_log',
    entityId: log.id,
    after: { id: log.id, projectId: log.projectId, logDate: log.logDate, status: log.status },
  });
  return log;
}

export async function updateDailyLog(context: OrgContext, raw: UpdateDailyLogInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const input = parseOrThrow(updateDailyLogSchema.safeParse(raw));

  if (input.workPackageId) {
    const existing = await findDailyLogById(context.db, context.organizationId, input.dailyLogId);
    if (!existing) throw new NotFoundError('Daily log');
    await assertProjectRefsInOrg(context, {
      projectId: existing.projectId,
      workPackageId: input.workPackageId,
    });
  }

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findDailyLogByIdForUpdate(tx, context.organizationId, input.dailyLogId);
    if (!existing) throw new NotFoundError('Daily log');

    assertDailyLogContentMutable(existing.status);

    if (input.logDate && input.logDate !== existing.logDate) {
      const clash = await findActiveDailyLogByProjectDate(
        tx,
        context.organizationId,
        existing.projectId,
        input.logDate,
        existing.id,
      );
      if (clash) {
        throw new ConflictError(
          'A daily log already exists for this project day',
          'fieldOps.errors.duplicateLogDate',
          { dailyLogId: clash.id },
        );
      }
    }

    const notesTouched = input.workforceNotes !== undefined || input.blockers !== undefined;
    const packedNotes = notesTouched
      ? packWorkforceAndBlockers(
          input.workforceNotes !== undefined ? input.workforceNotes : existing.workforceNotes,
          input.blockers !== undefined ? input.blockers : existing.blockers,
        )
      : undefined;

    let updated;
    try {
      updated = await updateDailyLogById(
        tx,
        context.organizationId,
        input.dailyLogId,
        {
          workPackageId: input.workPackageId === undefined ? undefined : input.workPackageId,
          logDate: input.logDate,
          weather: input.weather === undefined ? undefined : input.weather,
          summary: input.summary,
          workforceNotes: packedNotes,
          workPerformed: input.workPerformed === undefined ? undefined : input.workPerformed,
          delays: input.delays === undefined ? undefined : input.delays,
          incidents: input.incidents === undefined ? undefined : input.incidents,
          safetyNotes: input.safetyNotes === undefined ? undefined : input.safetyNotes,
          visitorNotes: input.visitorNotes === undefined ? undefined : input.visitorNotes,
          managerNotes: input.managerNotes === undefined ? undefined : input.managerNotes,
          workersOnSite: input.workersOnSite === undefined ? undefined : input.workersOnSite,
          subcontractorsOnSite:
            input.subcontractorsOnSite === undefined ? undefined : input.subcontractorsOnSite,
          equipmentOnSite: input.equipmentOnSite === undefined ? undefined : input.equipmentOnSite,
          deliveries: input.deliveries === undefined ? undefined : input.deliveries,
        },
        { fromStatuses: ['draft', 'submitted'] },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'A daily log already exists for this project day',
          'fieldOps.errors.duplicateLogDate',
        );
      }
      throw error;
    }
    if (!updated) throw new ConflictError('Daily log was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DAILY_LOG_UPDATED,
      entityType: 'daily_log',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
}

export async function transitionDailyLogStatus(
  context: OrgContext,
  raw: TransitionDailyLogStatusInput,
) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const input = parseOrThrow(transitionDailyLogStatusSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findDailyLogByIdForUpdate(tx, context.organizationId, input.dailyLogId);
    if (!existing) throw new NotFoundError('Daily log');

    if (existing.status === input.status) return existing;

    assertDailyLogStatusTransition(existing.status, input.status);
    if (isDailyLogLocked(existing.status) && input.status !== existing.status) {
      throw new DomainRuleError(
        'Finalized daily log cannot revert; use a correction',
        'fieldOps.errors.logFinalizedLocked',
      );
    }

    const now = new Date();
    const updated = await updateDailyLogById(
      tx,
      context.organizationId,
      input.dailyLogId,
      {
        status: input.status,
        ...submittedStamp(input.status, existing, context.userId, now),
        ...finalizedStamp(input.status, existing.finalizedAt, now),
      },
      { fromStatuses: [existing.status] },
    );
    if (!updated) throw new ConflictError('Daily log was updated concurrently');

    await recordAuditEvent(txContext, {
      action:
        input.status === 'finalized'
          ? AUDIT_ACTIONS.DAILY_LOG_FINALIZED
          : AUDIT_ACTIONS.DAILY_LOG_SUBMITTED,
      entityType: 'daily_log',
      entityId: updated.id,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function appendDailyLogCorrection(
  context: OrgContext,
  raw: AppendDailyLogCorrectionInput,
) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const input = parseOrThrow(appendDailyLogCorrectionSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findDailyLogByIdForUpdate(tx, context.organizationId, input.dailyLogId);
    if (!existing) throw new NotFoundError('Daily log');
    if (!isDailyLogLocked(existing.status)) {
      throw new DomainRuleError(
        'Correction notes are for finalized logs; edit the draft instead',
        'fieldOps.errors.correctionRequiresFinalized',
      );
    }

    const correctionNotes = appendDailyLogCorrectionNote(
      existing.correctionNotes,
      input.note,
      new Date(),
    );
    const updated = await updateDailyLogById(
      tx,
      context.organizationId,
      input.dailyLogId,
      { correctionNotes },
      { fromStatuses: ['finalized'] },
    );
    if (!updated) throw new ConflictError('Daily log was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DAILY_LOG_CORRECTION_ADDED,
      entityType: 'daily_log',
      entityId: updated.id,
      after: { correction: true },
    });
    return updated;
  });
}
