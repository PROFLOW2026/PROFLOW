import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertSafetyRecordStatusTransition,
  closedAtForSafetyRecordStatus,
  isOpenSafetyRecordStatus,
} from '../domain/status';
import { requireOrgRow } from '../domain/scope';
import type { SafetyListFilters, SafetyRecordDetail, SafetyRecordStatus, SafetyToolboxAttendeeRecord, SafetyToolboxTalkRecord } from '../domain/types';
import {
  findSafetyRecordById,
  findSafetyRecordByIdForUpdate,
  findToolboxTalkByRecordId,
  insertSafetyRecord,
  insertToolboxAttendee,
  insertToolboxTalk,
  listAttendeesForTalk,
  listCorrectiveActionsForRecord,
  listSafetyRecords,
  updateSafetyRecordById,
} from '../data/safety.repository';
import {
  createSafetyRecordSchema,
  updateSafetyRecordSchema,
  type CreateSafetyRecordInput,
  type UpdateSafetyRecordInput,
} from '../validation/schemas';
import { assertOptionalProjectInOrg, occurredDateString, requireToolboxTopic } from './assert-project';
import { parseOrThrow } from './parse';

export async function listSafetyRecordsForOrg(context: OrgContext, filters: SafetyListFilters = {}) {
  assertPermission(context, PERMISSIONS.SAFETY_READ);
  const [allowed, rows] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listSafetyRecords(context.db, context.organizationId, filters),
  ]);
  return rows.filter((row) => isAccessibleProjectId(allowed, row.projectId));
}

export async function getSafetyRecordForOrg(
  context: OrgContext,
  safetyRecordId: string,
): Promise<SafetyRecordDetail> {
  assertPermission(context, PERMISSIONS.SAFETY_READ);
  const record = await findSafetyRecordById(context.db, context.organizationId, safetyRecordId);
  if (!record) throw new NotFoundError('Safety record');
  requireOrgRow(record, context.organizationId, 'Safety record');
  if (record.projectId) await assertCanAccessProject(context, record.projectId);

  const [actions, toolboxTalk] = await Promise.all([
    listCorrectiveActionsForRecord(context.db, context.organizationId, record.id),
    findToolboxTalkByRecordId(context.db, context.organizationId, record.id),
  ]);
  const attendees = toolboxTalk
    ? await listAttendeesForTalk(context.db, context.organizationId, toolboxTalk.id)
    : [];

  return { ...record, actions, toolboxTalk, attendees };
}

export async function createSafetyRecord(context: OrgContext, raw: CreateSafetyRecordInput) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const input = parseOrThrow(createSafetyRecordSchema.safeParse(raw));
  await assertOptionalProjectInOrg(context, input.projectId);

  const topic = requireToolboxTopic(input.recordType, input.topic);
  const record = await insertSafetyRecord(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId ?? null,
    recordType: input.recordType,
    occurredAt: input.occurredAt,
    reporterUserId: context.userId,
    severity: input.severity ?? 'low',
    title: input.title,
    description: input.description,
    peopleInvolved: input.peopleInvolved ?? null,
    immediateAction: input.immediateAction ?? null,
    status: 'open',
  });

  let toolboxTalk: SafetyToolboxTalkRecord | null = null;
  const attendees: SafetyToolboxAttendeeRecord[] = [];

  if (input.recordType === 'toolbox_talk' && topic) {
    toolboxTalk = await insertToolboxTalk(context.db, {
      organizationId: context.organizationId,
      safetyRecordId: record.id,
      topic,
      talkDate: input.talkDate ?? occurredDateString(input.occurredAt),
      notes: input.talkNotes ?? null,
    });
    const names = input.attendeeNames ?? [];
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      attendees.push(
        await insertToolboxAttendee(context.db, {
          organizationId: context.organizationId,
          toolboxTalkId: toolboxTalk.id,
          attendeeName: trimmed,
        }),
      );
    }
  }

  await noteModuleUsage(context.db, context.organizationId, 'safety');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SAFETY_RECORD_CREATED,
    entityType: 'safety_record',
    entityId: record.id,
    after: { id: record.id, recordType: record.recordType, status: record.status },
  });
  return { ...record, actions: [], toolboxTalk, attendees };
}

export async function updateSafetyRecord(context: OrgContext, raw: UpdateSafetyRecordInput) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const input = parseOrThrow(updateSafetyRecordSchema.safeParse(raw));

  if (input.projectId) await assertOptionalProjectInOrg(context, input.projectId);

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findSafetyRecordByIdForUpdate(
      tx,
      context.organizationId,
      input.safetyRecordId,
    );
    if (!existing) throw new NotFoundError('Safety record');

    if (input.status) {
      assertSafetyRecordStatusTransition(existing.status, input.status as SafetyRecordStatus);
    }

    const nextStatus = (input.status as SafetyRecordStatus | undefined) ?? existing.status;
    const statusChanging = input.status !== undefined && input.status !== existing.status;
    const closing =
      statusChanging && (nextStatus === 'closed' || nextStatus === 'cancelled');
    if (closing && !isOpenSafetyRecordStatus(existing.status)) {
      throw new ConflictError('Safety record was already closed');
    }

    const closedAt = statusChanging ? closedAtForSafetyRecordStatus(nextStatus) : undefined;
    const closedByUserId = statusChanging
      ? nextStatus === 'closed' || nextStatus === 'cancelled'
        ? context.userId
        : null
      : undefined;

    const updated = await updateSafetyRecordById(
      tx,
      context.organizationId,
      input.safetyRecordId,
      {
        projectId: input.projectId === undefined ? undefined : input.projectId,
        recordType: input.recordType,
        occurredAt: input.occurredAt,
        severity: input.severity,
        title: input.title,
        description: input.description,
        peopleInvolved: input.peopleInvolved === undefined ? undefined : input.peopleInvolved,
        immediateAction: input.immediateAction === undefined ? undefined : input.immediateAction,
        status: statusChanging ? (input.status as SafetyRecordStatus) : undefined,
        closedAt,
        closedByUserId,
      },
      statusChanging ? { fromStatuses: [existing.status] } : undefined,
    );
    if (!updated) throw new ConflictError('Safety record was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SAFETY_RECORD_UPDATED,
      entityType: 'safety_record',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
}
