import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  deleteMeetingAttendee,
  findMeetingById,
  insertMeetingAttendee,
  listMeetingAttendees,
} from '../data/meetings.repository';
import type { AddAttendeeInput, MeetingAttendee } from '../domain/types';

export async function addAttendeeToMeeting(
  context: OrgContext,
  input: AddAttendeeInput,
): Promise<MeetingAttendee> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const meeting = await findMeetingById(context.db, context.organizationId, input.meetingId);
  if (!meeting) throw new NotFoundError('Meeting');

  // Validate that at least one identity is provided
  if (!input.orgMemberId && !input.employeeId && !input.contactId && !input.displayName?.trim()) {
    throw new ValidationError([
      { path: 'attendee', message: 'At least one identity must be provided (member, employee, contact, or name)' },
    ]);
  }

  return insertMeetingAttendee(context.db, context.organizationId, {
    ...input,
    displayName: input.displayName?.trim() ?? null,
  });
}

export async function removeAttendeeFromMeeting(
  context: OrgContext,
  meetingId: string,
  attendeeId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.MEETINGS_MANAGE);

  const meeting = await findMeetingById(context.db, context.organizationId, meetingId);
  if (!meeting) throw new NotFoundError('Meeting');

  const removed = await deleteMeetingAttendee(context.db, context.organizationId, attendeeId);
  if (!removed) throw new NotFoundError('Attendee');
}

export async function listAttendeesForMeeting(
  context: OrgContext,
  meetingId: string,
): Promise<MeetingAttendee[]> {
  assertPermission(context, PERMISSIONS.MEETINGS_READ);

  const meeting = await findMeetingById(context.db, context.organizationId, meetingId);
  if (!meeting) throw new NotFoundError('Meeting');

  return listMeetingAttendees(context.db, context.organizationId, meetingId);
}
