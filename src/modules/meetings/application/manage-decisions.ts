import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  deleteMeetingDecision,
  findMeetingById,
  insertMeetingDecision,
  updateMeetingDecisionById,
} from '../data/meetings.repository';
import type { CreateDecisionInput, MeetingDecision, UpdateDecisionInput } from '../domain/types';

/**
 * Create a canonical decision record under a meeting.
 *
 * IMPORTANT: A decision is NOT a task. It is a canonical record of an
 * agreed outcome. Action items (which may optionally create tasks) are
 * managed separately via manage-action-items.ts.
 */
export async function createMeetingDecision(
  context: OrgContext,
  input: CreateDecisionInput,
): Promise<MeetingDecision> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  if (!input.title?.trim()) {
    throw new ValidationError([{ path: 'title', message: 'Decision title is required' }]);
  }

  const meeting = await findMeetingById(context.db, context.organizationId, input.meetingId);
  if (!meeting) throw new NotFoundError('Meeting');

  return insertMeetingDecision(context.db, context.organizationId, {
    ...input,
    title: input.title.trim(),
  });
}

export async function updateMeetingDecision(
  context: OrgContext,
  decisionId: string,
  patch: UpdateDecisionInput,
): Promise<MeetingDecision> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const updated = await updateMeetingDecisionById(
    context.db,
    context.organizationId,
    decisionId,
    patch,
  );

  if (!updated) throw new NotFoundError('Decision');
  return updated;
}

export async function deleteMeetingDecisionById(
  context: OrgContext,
  decisionId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const removed = await deleteMeetingDecision(context.db, context.organizationId, decisionId);
  if (!removed) throw new NotFoundError('Decision');
}
