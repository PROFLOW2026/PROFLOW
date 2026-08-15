'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  acknowledgeToolboxAttendee,
  addToolboxAttendee,
  createCorrectiveAction,
  createSafetyRecord,
  updateCorrectiveAction,
  updateSafetyRecord,
  type CreateSafetyRecordInput,
  type SafetyActionStatus,
  type SafetyRecordStatus,
  type SafetyRecordType,
  type SafetySeverity,
} from '@/modules/safety';
import { linkDailyLogSafetyRecord } from '@/modules/field-ops';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface SafetyFormState {
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

function mapValidationError(error: ValidationError): SafetyFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<SafetyFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('safety');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^safety\./, '');
    try {
      return { error: t(key as 'errors.invalidRecordTransition') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

function revalidateSafety(recordId?: string) {
  revalidatePath('/safety');
  if (recordId) revalidatePath(`/safety/${recordId}`);
}

function parseOccurredAt(formData: FormData): Date {
  const raw = requiredFormValue(formData, 'occurredAt');
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function createSafetyRecordAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  const locale = await getLocale();
  const attendeeNames = (formValue(formData, 'attendeeNames') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const input: CreateSafetyRecordInput = {
    projectId: formValue(formData, 'projectId'),
    recordType: requiredFormValue(formData, 'recordType') as SafetyRecordType,
    occurredAt: parseOccurredAt(formData),
    severity: (formValue(formData, 'severity') as SafetySeverity | undefined) ?? 'low',
    title: requiredFormValue(formData, 'title'),
    description: requiredFormValue(formData, 'description'),
    peopleInvolved: formValue(formData, 'peopleInvolved'),
    immediateAction: formValue(formData, 'immediateAction'),
    topic: formValue(formData, 'topic'),
    talkDate: formValue(formData, 'talkDate'),
    talkNotes: formValue(formData, 'talkNotes'),
    attendeeNames,
  };

  try {
    const record = await withOrgContext(async (context) => {
      const created = await createSafetyRecord(context, input);
      const fromDailyLogId = formValue(formData, 'fromDailyLogId');
      if (fromDailyLogId) {
        await linkDailyLogSafetyRecord(context, {
          dailyLogId: fromDailyLogId,
          safetyRecordId: created.id,
        });
        revalidatePath(`/field-ops/logs/${fromDailyLogId}`);
      }
      return created;
    });
    revalidateSafety(record.id);
    redirect({ href: `/safety/${record.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateSafetyRecordAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const recordId = requiredFormValue(formData, 'safetyRecordId');
    await withOrgContext((context) =>
      updateSafetyRecord(context, {
        safetyRecordId: recordId,
        projectId: formNullableText(formData, 'projectId'),
        recordType: formValue(formData, 'recordType') as SafetyRecordType | undefined,
        occurredAt: formData.has('occurredAt') ? parseOccurredAt(formData) : undefined,
        severity: formValue(formData, 'severity') as SafetySeverity | undefined,
        title: formValue(formData, 'title'),
        description: formValue(formData, 'description'),
        peopleInvolved: formNullableText(formData, 'peopleInvolved'),
        immediateAction: formNullableText(formData, 'immediateAction'),
        status: formValue(formData, 'status') as SafetyRecordStatus | undefined,
      }),
    );
    revalidateSafety(recordId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createCorrectiveActionAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const safetyRecordId = requiredFormValue(formData, 'safetyRecordId');
    await withOrgContext((context) =>
      createCorrectiveAction(context, {
        safetyRecordId,
        title: requiredFormValue(formData, 'title'),
        description: formValue(formData, 'description'),
        ownerUserId: (() => {
          const value = formValue(formData, 'ownerUserId');
          if (!value || value === '__none__') return undefined;
          return value;
        })(),
        dueDate: formValue(formData, 'dueDate'),
      }),
    );
    revalidateSafety(safetyRecordId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateCorrectiveActionStatusAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const action = await withOrgContext((context) =>
      updateCorrectiveAction(context, {
        actionId: requiredFormValue(formData, 'actionId'),
        status: requiredFormValue(formData, 'status') as SafetyActionStatus,
      }),
    );
    revalidateSafety(action.safetyRecordId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function addToolboxAttendeeAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    const safetyRecordId = requiredFormValue(formData, 'safetyRecordId');
    await withOrgContext((context) =>
      addToolboxAttendee(context, {
        safetyRecordId,
        attendeeName: requiredFormValue(formData, 'attendeeName'),
        employeeId: formValue(formData, 'employeeId'),
      }),
    );
    revalidateSafety(safetyRecordId);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function acknowledgeToolboxAttendeeAction(
  _prev: SafetyFormState,
  formData: FormData,
): Promise<SafetyFormState> {
  try {
    await withOrgContext((context) =>
      acknowledgeToolboxAttendee(context, {
        attendeeId: requiredFormValue(formData, 'attendeeId'),
      }),
    );
    revalidateSafety(formValue(formData, 'safetyRecordId'));
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
