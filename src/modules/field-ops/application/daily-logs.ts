import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findDailyLogById,
  insertDailyLog,
  listDailyLogs,
  updateDailyLogById,
} from '../data/field-ops.repository';
import {
  createDailyLogSchema,
  updateDailyLogSchema,
  type CreateDailyLogInput,
  type UpdateDailyLogInput,
} from '../validation/schemas';
import { assertProjectRefsInOrg } from './assert-project-refs';

export async function listDailyLogsForOrg(context: OrgContext, projectId?: string) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  return listDailyLogs(context.db, context.organizationId, projectId);
}

export async function createDailyLog(context: OrgContext, raw: CreateDailyLogInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const parsed = createDailyLogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertProjectRefsInOrg(context, {
    projectId: input.projectId,
    workPackageId: input.workPackageId,
  });

  const log = await insertDailyLog(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    workPackageId: input.workPackageId ?? null,
    logDate: input.logDate,
    weather: input.weather ?? null,
    summary: input.summary,
    workforceNotes: input.workforceNotes ?? null,
    createdBy: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'field_ops');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DAILY_LOG_CREATED,
    entityType: 'daily_log',
    entityId: log.id,
    after: { id: log.id, projectId: log.projectId, logDate: log.logDate },
  });
  return log;
}

export async function updateDailyLog(context: OrgContext, raw: UpdateDailyLogInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const parsed = updateDailyLogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findDailyLogById(context.db, context.organizationId, input.dailyLogId);
  if (!existing) throw new NotFoundError('Daily log');

  if (input.workPackageId) {
    await assertProjectRefsInOrg(context, {
      projectId: existing.projectId,
      workPackageId: input.workPackageId,
    });
  }

  const updated = await updateDailyLogById(context.db, context.organizationId, input.dailyLogId, {
    workPackageId: input.workPackageId === undefined ? undefined : input.workPackageId,
    logDate: input.logDate,
    weather: input.weather === undefined ? undefined : input.weather,
    summary: input.summary,
    workforceNotes: input.workforceNotes === undefined ? undefined : input.workforceNotes,
  });
  if (!updated) throw new NotFoundError('Daily log');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DAILY_LOG_UPDATED,
    entityType: 'daily_log',
    entityId: updated.id,
    before: existing,
    after: updated,
  });
  return updated;
}
