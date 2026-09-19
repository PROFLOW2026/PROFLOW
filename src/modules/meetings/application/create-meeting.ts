import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { insertMeeting } from '../data/meetings.repository';
import type { CreateMeetingInput, MeetingRecord } from '../domain/types';

export async function createMeeting(
  context: OrgContext,
  input: CreateMeetingInput,
): Promise<MeetingRecord> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  if (!input.title?.trim()) {
    throw new ValidationError([{ path: 'title', message: 'Title is required' }]);
  }
  if (!input.scheduledAt) {
    throw new ValidationError([{ path: 'scheduledAt', message: 'Scheduled date is required' }]);
  }

  return insertMeeting(
    context.db,
    context.organizationId,
    {
      title: input.title.trim(),
      scheduledAt: input.scheduledAt,
      projectId: input.projectId ?? null,
      workspaceId: input.workspaceId ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
    },
    context.membershipId,
  );
}
