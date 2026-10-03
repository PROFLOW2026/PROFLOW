'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import {
  addContractorMeetingAttendee,
  addInternalMeetingAttendee,
  addMeetingActionItem,
  cancelSiteMeeting,
  createSiteMeeting,
  markSiteMeetingHeld,
  publishMeetingMinutes,
  recordMeetingDecision,
  removeContractorMeetingAttendee,
  removeInternalMeetingAttendee,
  saveMeetingMinutes,
  setContractorMeetingAttendance,
  setMeetingActionItemStatus,
  updateSiteMeeting,
} from '@/modules/site-meetings';
import {
  FIELD_ACTION_OK,
  mapFieldActionError,
  type FieldActionState,
} from '@/modules/site-log/shared/action-state';
import { formDataToObject } from '@/modules/site-log/shared/validation';
import type { OrgContext } from '@/shared/auth/context';
import { resolveProjectRouteBase } from '@/modules/project-workspace/domain/project-surface-path';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';

function revalidateMeeting(projectId: string, meetingId?: string) {
  revalidatePath(`/projects/${projectId}/site-meetings`);
  revalidatePath(`/employee/projects/${projectId}/site-meetings`);
  if (meetingId) {
    revalidatePath(`/projects/${projectId}/site-meetings/${meetingId}`);
    revalidatePath(`/employee/projects/${projectId}/site-meetings/${meetingId}`);
  }
}

async function runMeetingAction(
  formData: FormData,
  run: (context: OrgContext, input: Record<string, string>) => Promise<unknown>,
): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) => run(context, input));
    revalidateMeeting(input.projectId ?? '', input.meetingId);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function createSiteMeetingAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  let meetingId: string;
  try {
    meetingId = await withOrgContext((context) =>
      createSiteMeeting(context, {
        projectId: input.projectId ?? '',
        title: input.title ?? '',
        meetingType: (input.meetingType || 'weekly_contractor') as never,
        scheduledAt: input.scheduledAt ?? '',
        location: input.location,
        agenda: input.agenda,
      }),
    );
    revalidateMeeting(input.projectId ?? '');
  } catch (error) {
    return mapFieldActionError(error);
  }
  redirect({
    href: `${resolveProjectRouteBase(input.projectId ?? '', 'site-meetings', input.returnBase)}/${meetingId}`,
    locale: await getLocale(),
  });
}

export async function updateSiteMeetingAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) =>
    updateSiteMeeting(context, {
      projectId: input.projectId ?? '',
      meetingId: input.meetingId ?? '',
      title: input.title ?? '',
      meetingType: (input.meetingType || 'weekly_contractor') as never,
      scheduledAt: input.scheduledAt ?? '',
      location: input.location,
      agenda: input.agenda,
    }),
  );
}

export async function saveMinutesAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) =>
    saveMeetingMinutes(context, { projectId: input.projectId ?? '', meetingId: input.meetingId ?? '', minutes: input.minutes }),
  );
}

export async function meetingLifecycleAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) => {
    const key = { projectId: input.projectId ?? '', meetingId: input.meetingId ?? '' };
    if (input.intent === 'held') return markSiteMeetingHeld(context, key);
    if (input.intent === 'cancel') return cancelSiteMeeting(context, key);
    return publishMeetingMinutes(context, key);
  });
}

export async function addAttendeeAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) => {
    const key = { projectId: input.projectId ?? '', meetingId: input.meetingId ?? '' };
    const [kind, first, second] = (input.attendee ?? '').split(':');
    if (kind === 'member') return addInternalMeetingAttendee(context, { ...key, membershipId: first ?? '' });
    return addContractorMeetingAttendee(context, {
      ...key,
      vendorId: first ?? '',
      subcontractAgreementId: second || null,
      displayName: input.displayName,
    });
  });
}

export async function removeAttendeeAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) => {
    const key = { projectId: input.projectId ?? '', meetingId: input.meetingId ?? '', attendeeId: input.attendeeId ?? '' };
    return input.kind === 'contractor'
      ? removeContractorMeetingAttendee(context, key)
      : removeInternalMeetingAttendee(context, key);
  });
}

export async function setAttendanceAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) =>
    setContractorMeetingAttendance(context, {
      projectId: input.projectId ?? '',
      meetingId: input.meetingId ?? '',
      attendeeId: input.attendeeId ?? '',
      attendance: input.attendance ?? '',
    }),
  );
}

export async function recordDecisionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) =>
    recordMeetingDecision(context, {
      projectId: input.projectId ?? '',
      meetingId: input.meetingId ?? '',
      title: input.title ?? '',
      body: input.body,
    }),
  );
}

export async function addActionItemAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) =>
    addMeetingActionItem(context, {
      projectId: input.projectId ?? '',
      meetingId: input.meetingId ?? '',
      title: input.title ?? '',
      dueDate: input.dueDate,
      assignee: input.assignee,
      decisionId: input.decisionId,
      createTask: input.createTask === 'on',
    }),
  );
}

export async function setActionItemStatusAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  return runMeetingAction(formData, (context, input) =>
    setMeetingActionItemStatus(context, {
      projectId: input.projectId ?? '',
      meetingId: input.meetingId ?? '',
      actionItemId: input.actionItemId ?? '',
      status: input.status ?? '',
    }),
  );
}
