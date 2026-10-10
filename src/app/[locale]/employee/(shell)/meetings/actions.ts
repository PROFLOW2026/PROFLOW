'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createMeeting } from '@/modules/meetings';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError, mapServerActionError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { MeetingFormState } from '@/app/[locale]/(app)/meetings/actions';
import { getTranslations } from 'next-intl/server';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function formNullableText(formData: FormData, key: string): string | null | undefined {
  if (!formData.has(key)) return undefined;
  const text = String(formData.get(key) ?? '').trim();
  return text === '' ? null : text;
}

function parseScheduledAt(formData: FormData): Date {
  const raw = requiredFormValue(formData, 'scheduledAt');
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError([{ path: 'scheduledAt', message: 'Invalid date' }]);
  }
  return parsed;
}

async function mapMeetingActionError(error: unknown): Promise<MeetingFormState> {
  const tErrors = await getTranslations('errors');
  const tValidation = await getTranslations('validation');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    tValidation: (key) => tValidation(key as 'invalidDate'),
  });
}

export async function employeeCreateMeetingAction(
  _prev: MeetingFormState,
  formData: FormData,
): Promise<MeetingFormState> {
  const locale = await getLocale();

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      if (!employeeHasPermission(context, PERMISSIONS.MEETINGS_MANAGE)) {
        throw new DomainRuleError('No permission', 'employeeApp.errors.notAuthorized');
      }
      return createMeeting(context, {
        title: requiredFormValue(formData, 'title'),
        scheduledAt: parseScheduledAt(formData),
        projectId: formValue(formData, 'projectId') ?? null,
        workspaceId: formValue(formData, 'workspaceId') ?? null,
        location: formNullableText(formData, 'location') ?? null,
        notes: formNullableText(formData, 'notes') ?? null,
      });
    });

    revalidatePath('/employee/meetings');
    revalidatePath('/meetings');
    redirect({ href: '/employee/meetings', locale });
  } catch (error) {
    if (error instanceof ValidationError) return mapMeetingActionError(error);
    if (error instanceof AppError) return mapMeetingActionError(error);
    throw error;
  }

  return {};
}
