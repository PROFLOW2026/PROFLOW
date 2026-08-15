import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findEmployeeById } from '@/modules/workforce';
import {
  findSafetyRecordById,
  findToolboxAttendeeByIdForUpdate,
  findToolboxTalkByRecordId,
  insertToolboxAttendee,
  insertToolboxTalk,
  updateToolboxAttendeeById,
} from '../data/safety.repository';
import {
  acknowledgeToolboxAttendeeSchema,
  addToolboxAttendeeSchema,
  type AcknowledgeToolboxAttendeeInput,
  type AddToolboxAttendeeInput,
} from '../validation/schemas';
import { occurredDateString } from './assert-project';
import { parseOrThrow } from './parse';

export async function addToolboxAttendee(context: OrgContext, raw: AddToolboxAttendeeInput) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const input = parseOrThrow(addToolboxAttendeeSchema.safeParse(raw));

  const record = await findSafetyRecordById(
    context.db,
    context.organizationId,
    input.safetyRecordId,
  );
  if (!record) throw new NotFoundError('Safety record');
  if (record.recordType !== 'toolbox_talk') {
    throw new DomainRuleError(
      'Attendees can only be added to toolbox talks',
      'safety.errors.attendeesRequireTalk',
    );
  }

  let talk = await findToolboxTalkByRecordId(context.db, context.organizationId, record.id);
  if (!talk) {
    talk = await insertToolboxTalk(context.db, {
      organizationId: context.organizationId,
      safetyRecordId: record.id,
      topic: record.title,
      talkDate: occurredDateString(record.occurredAt),
      notes: null,
    });
  }

  if (input.employeeId) {
    const employee = await findEmployeeById(
      context.db,
      context.organizationId,
      input.employeeId,
    );
    if (!employee) throw new NotFoundError('Employee');
  }

  const attendee = await insertToolboxAttendee(context.db, {
    organizationId: context.organizationId,
    toolboxTalkId: talk.id,
    employeeId: input.employeeId ?? null,
    attendeeName: input.attendeeName,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SAFETY_ATTENDEE_ADDED,
    entityType: 'safety_toolbox_attendee',
    entityId: attendee.id,
    after: { attendeeName: attendee.attendeeName, toolboxTalkId: talk.id },
  });
  return attendee;
}

export async function acknowledgeToolboxAttendee(
  context: OrgContext,
  raw: AcknowledgeToolboxAttendeeInput,
) {
  assertPermission(context, PERMISSIONS.SAFETY_MANAGE);
  const input = parseOrThrow(acknowledgeToolboxAttendeeSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findToolboxAttendeeByIdForUpdate(
      tx,
      context.organizationId,
      input.attendeeId,
    );
    if (!existing) throw new NotFoundError('Attendee');
    if (existing.acknowledgedAt) return existing;

    const updated = await updateToolboxAttendeeById(tx, context.organizationId, input.attendeeId, {
      acknowledgedAt: new Date(),
    });
    if (!updated) throw new NotFoundError('Attendee');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SAFETY_ATTENDEE_ACKNOWLEDGED,
      entityType: 'safety_toolbox_attendee',
      entityId: updated.id,
      after: { acknowledgedAt: updated.acknowledgedAt },
    });
    return updated;
  });
}
