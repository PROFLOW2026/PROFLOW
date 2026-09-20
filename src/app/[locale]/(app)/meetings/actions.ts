'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  addAttendeeToMeeting,
  createMeeting,
  createMeetingActionItem,
  createMeetingDecision,
  createTaskFromActionItem,
  updateMeeting,
  updateMeetingActionItem,
  updateMeetingDecision,
} from '@/modules/meetings';
import type { MeetingActionItemStatus } from '@/modules/meetings';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ValidationError, isAppError, mapServerActionError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface MeetingFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function formNullableText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const text = String(formData.get(key) ?? '').trim();
  return text === '' ? null : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function parseScheduledAt(formData: FormData): Date {
  const raw = requiredFormValue(formData, 'scheduledAt');
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError([{ path: 'scheduledAt', message: 'Invalid date' }]);
  }
  return parsed;
}

function parseOptionalDate(formData: FormData, key: string): Date | null {
  const raw = formValue(formData, key);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError([{ path: key, message: 'Invalid date' }]);
  }
  return parsed;
}

function revalidateMeeting(meetingId: string) {
  revalidatePath('/meetings');
  revalidatePath(`/meetings/${meetingId}`);
}

async function mapMeetingActionError(error: unknown): Promise<MeetingFormState> {
  const tErrors = await getTranslations('errors');
  const tValidation = await getTranslations('validation');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    tValidation: (key) => tValidation(key as 'invalidDate'),
  });
}

export async function createMeetingAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();

  try {
    const meeting = await withOrgContext(async (context) =>
      createMeeting(context, {
        title: requiredFormValue(formData, 'title'),
        scheduledAt: parseScheduledAt(formData),
        projectId: formValue(formData, 'projectId') ?? null,
        workspaceId: formValue(formData, 'workspaceId') ?? null,
        location: formNullableText(formData, 'location') ?? null,
        notes: formNullableText(formData, 'notes') ?? null,
      }),
    );

    revalidatePath('/meetings');
    redirect({ href: `/meetings/${meeting.id}`, locale });
  } catch (error) {
    if (error instanceof ValidationError) return mapMeetingActionError(error);
    if (error instanceof AppError) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function updateMeetingAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');

  try {
    await withOrgContext(async (context) =>
      updateMeeting(context, meetingId, {
        title: requiredFormValue(formData, 'title'),
        scheduledAt: parseScheduledAt(formData),
        projectId: formValue(formData, 'projectId') ?? null,
        workspaceId: formValue(formData, 'workspaceId') ?? null,
        location: formNullableText(formData, 'location') ?? null,
        notes: formNullableText(formData, 'notes') ?? null,
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/meetings/${meetingId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function addAttendeeAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');
  const attendeeType = requiredFormValue(formData, 'attendeeType');

  try {
    await withOrgContext(async (context) =>
      addAttendeeToMeeting(context, {
        meetingId,
        orgMemberId: attendeeType === 'member' ? formValue(formData, 'orgMemberId') ?? null : null,
        employeeId: attendeeType === 'employee' ? formValue(formData, 'employeeId') ?? null : null,
        contactId: attendeeType === 'contact' ? formValue(formData, 'contactId') ?? null : null,
        displayName: attendeeType === 'external' ? formValue(formData, 'displayName') ?? null : null,
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/meetings/${meetingId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function createDecisionAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');

  try {
    await withOrgContext(async (context) =>
      createMeetingDecision(context, {
        meetingId,
        title: requiredFormValue(formData, 'title'),
        body: formNullableText(formData, 'body') ?? null,
        decidedAt: parseOptionalDate(formData, 'decidedAt'),
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/meetings/${meetingId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function updateDecisionAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');
  const decisionId = requiredFormValue(formData, 'decisionId');

  try {
    await withOrgContext(async (context) =>
      updateMeetingDecision(context, decisionId, {
        title: requiredFormValue(formData, 'title'),
        body: formNullableText(formData, 'body') ?? null,
        decidedAt: parseOptionalDate(formData, 'decidedAt'),
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/meetings/${meetingId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function createActionItemAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');
  const assigneeType = formValue(formData, 'assigneeType') ?? 'none';

  try {
    await withOrgContext(async (context) =>
      createMeetingActionItem(context, {
        meetingId,
        decisionId: formValue(formData, 'decisionId') ?? null,
        title: requiredFormValue(formData, 'title'),
        assignedToOrgMemberId:
          assigneeType === 'member' ? formValue(formData, 'assignedToOrgMemberId') ?? null : null,
        assignedToEmployeeId:
          assigneeType === 'employee' ? formValue(formData, 'assignedToEmployeeId') ?? null : null,
        dueDate: formValue(formData, 'dueDate') ?? null,
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/meetings/${meetingId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function updateActionItemAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');
  const actionItemId = requiredFormValue(formData, 'actionItemId');
  const assigneeType = formValue(formData, 'assigneeType') ?? 'none';
  const statusRaw = formValue(formData, 'status');
  const status = statusRaw as MeetingActionItemStatus | undefined;

  try {
    await withOrgContext(async (context) =>
      updateMeetingActionItem(context, actionItemId, {
        title: requiredFormValue(formData, 'title'),
        assignedToOrgMemberId:
          assigneeType === 'member' ? formValue(formData, 'assignedToOrgMemberId') ?? null : null,
        assignedToEmployeeId:
          assigneeType === 'employee' ? formValue(formData, 'assignedToEmployeeId') ?? null : null,
        dueDate: formValue(formData, 'dueDate') ?? null,
        status,
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/meetings/${meetingId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}

export async function createTaskFromActionItemAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();
  const meetingId = requiredFormValue(formData, 'meetingId');
  const actionItemId = requiredFormValue(formData, 'actionItemId');

  try {
    const { taskId } = await withOrgContext(async (context) =>
      createTaskFromActionItem(context, actionItemId, {
        workspaceId: requiredFormValue(formData, 'workspaceId'),
        projectId: formValue(formData, 'projectId') ?? null,
        title: formValue(formData, 'title'),
        dueDate: formValue(formData, 'dueDate') ?? null,
      }),
    );

    revalidateMeeting(meetingId);
    redirect({ href: `/tasks/${taskId}`, locale });
  } catch (error) {
    if (isAppError(error)) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}
