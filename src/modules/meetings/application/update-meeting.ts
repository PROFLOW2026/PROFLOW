import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { updateMeetingById } from '../data/meetings.repository';
import type { MeetingRecord, UpdateMeetingInput } from '../domain/types';

export async function updateMeeting(
  context: OrgContext,
  meetingId: string,
  input: UpdateMeetingInput,
): Promise<MeetingRecord> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const updated = await updateMeetingById(
    context.db,
    context.organizationId,
    meetingId,
    input,
  );

  if (!updated) {
    throw new NotFoundError('Meeting');
  }

  return updated;
}
