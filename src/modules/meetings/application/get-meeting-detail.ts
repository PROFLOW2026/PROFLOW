import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getMeetingDetail } from '../data/meetings.repository';
import type { MeetingDetail } from '../domain/types';

export async function getMeetingDetailById(
  context: OrgContext,
  meetingId: string,
): Promise<MeetingDetail> {
  assertPermission(context, PERMISSIONS.MEETINGS_READ);

  const detail = await getMeetingDetail(context.db, context.organizationId, meetingId);

  if (!detail) {
    throw new NotFoundError('Meeting');
  }

  return detail;
}
