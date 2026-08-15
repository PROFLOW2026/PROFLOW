import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertSafetyActionStatusTransition,
  closedAtForSafetyActionStatus,
  isOpenSafetyActionStatus,
} from '../domain/status';
import type { SafetyActionStatus } from '../domain/types';
import {
  findCorrectiveActionByIdForUpdate,
  findSafetyRecordById,
  insertCorrectiveAction,
  updateCorrectiveActionById,
} from '../data/safety.repository';
import {
  createCorrectiveActionSchema,
  updateCorrectiveActionSchema,
  type CreateCorrectiveActionInput,
  type UpdateCorrectiveActionInput,
} from '../validation/schemas';
import { parseOrThrow } from './parse';

export async function createCorrectiveAction(context: OrgContext, raw: CreateCorrectiveActionInput) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const input = parseOrThrow(createCorrectiveActionSchema.safeParse(raw));

  const record = await findSafetyRecordById(
    context.db,
    context.organizationId,
    input.safetyRecordId,
  );
  if (!record) throw new NotFoundError('Safety record');

  const action = await insertCorrectiveAction(context.db, {
    organizationId: context.organizationId,
    safetyRecordId: record.id,
    title: input.title,
    description: input.description ?? null,
    ownerUserId: input.ownerUserId ?? null,
    dueDate: input.dueDate ?? null,
    status: 'open',
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SAFETY_ACTION_CREATED,
    entityType: 'safety_corrective_action',
    entityId: action.id,
    after: { id: action.id, safetyRecordId: action.safetyRecordId, status: action.status },
  });
  return action;
}

export async function updateCorrectiveAction(context: OrgContext, raw: UpdateCorrectiveActionInput) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const input = parseOrThrow(updateCorrectiveActionSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findCorrectiveActionByIdForUpdate(
      tx,
      context.organizationId,
      input.actionId,
    );
    if (!existing) throw new NotFoundError('Corrective action');

    if (input.status) {
      assertSafetyActionStatusTransition(existing.status, input.status as SafetyActionStatus);
    }

    const nextStatus = (input.status as SafetyActionStatus | undefined) ?? existing.status;
    const statusChanging = input.status !== undefined && input.status !== existing.status;
    const closing = statusChanging && (nextStatus === 'done' || nextStatus === 'cancelled');
    if (closing && !isOpenSafetyActionStatus(existing.status)) {
      throw new ConflictError('Corrective action was already closed');
    }

    const closedAt = statusChanging ? closedAtForSafetyActionStatus(nextStatus) : undefined;

    const updated = await updateCorrectiveActionById(
      tx,
      context.organizationId,
      input.actionId,
      {
        title: input.title,
        description: input.description === undefined ? undefined : input.description,
        ownerUserId: input.ownerUserId === undefined ? undefined : input.ownerUserId,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate,
        status: statusChanging ? (input.status as SafetyActionStatus) : undefined,
        closedAt,
      },
      statusChanging ? { fromStatuses: [existing.status] } : undefined,
    );
    if (!updated) throw new ConflictError('Corrective action was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SAFETY_ACTION_UPDATED,
      entityType: 'safety_corrective_action',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
}
