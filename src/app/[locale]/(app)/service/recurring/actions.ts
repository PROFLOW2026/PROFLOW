'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createRecurrenceDefinition,
  endRecurrenceDefinition,
  generateRecurrenceOccurrences,
  pauseRecurrenceDefinition,
  resumeRecurrenceDefinition,
  skipRecurrenceOccurrence,
} from '@/modules/service';
import type { RecurrenceFormState } from '@/modules/service/recurrence/ui/recurrence-create-form';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  DomainRuleError,
  ValidationError,
} from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

async function mapError(error: unknown): Promise<RecurrenceFormState> {
  const tErrors = await getTranslations('errors');
  const tService = await getTranslations('service.recurring');
  const tValidation = await getTranslations('validation');

  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      if (!issue.path) continue;
      fieldErrors[issue.path] =
        issue.message === 'validation.endBeforeStart'
          ? tValidation('endBeforeStart')
          : issue.message;
    }
    return { error: error.message, fieldErrors };
  }
  if (error instanceof DomainRuleError) {
    const key = error.messageKey;
    if (key === 'service.errors.recurrenceNotActive') {
      return { error: tService('errors.recurrenceNotActive') };
    }
    if (key === 'service.errors.recurrenceEnded') {
      return { error: tService('errors.recurrenceEnded') };
    }
    if (key === 'service.errors.occurrenceAlreadyGenerated') {
      return { error: tService('errors.occurrenceAlreadyGenerated') };
    }
    return { error: error.message };
  }
  if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

export async function createRecurrenceDefinitionAction(
  _prev: RecurrenceFormState,
  formData: FormData,
): Promise<RecurrenceFormState> {
  const locale = await getLocale();

  try {
    const result = await withOrgContext((context) =>
      createRecurrenceDefinition(context, {
        title: formValue(formData, 'title') ?? '',
        clientId: formValue(formData, 'clientId'),
        siteAddress: formValue(formData, 'siteAddress'),
        frequency: (formValue(formData, 'frequency') ?? 'monthly') as
          | 'daily'
          | 'weekly'
          | 'monthly'
          | 'quarterly'
          | 'yearly',
        intervalCount: Number(formValue(formData, 'intervalCount') ?? '1'),
        startDate: formValue(formData, 'startDate') ?? '',
        endDate: formValue(formData, 'endDate'),
        defaultDurationMinutes: formValue(formData, 'defaultDurationMinutes')
          ? Number(formValue(formData, 'defaultDurationMinutes'))
          : null,
        defaultPricingMode: (formValue(formData, 'defaultPricingMode') ?? 'none') as
          | 'fixed'
          | 'open'
          | 'none',
        defaultPriceAmount: formValue(formData, 'defaultPriceAmount'),
        currency: formValue(formData, 'currency'),
        defaultChecklistTemplateId: formValue(formData, 'defaultChecklistTemplateId'),
        defaultAssigneeEmployeeId: formValue(formData, 'defaultAssigneeEmployeeId'),
        notes: formValue(formData, 'notes'),
      }),
    );

    revalidatePath('/service/recurring');
    redirect({ href: `/service/recurring/${result.id}`, locale });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DomainRuleError || error instanceof AuthorizationError || error instanceof AppError) {
      return await mapError(error);
    }
    throw error;
  }
}

export async function generateRecurrenceAction(
  _prev: RecurrenceFormState,
  formData: FormData,
): Promise<RecurrenceFormState> {
  try {
    const definitionId = formValue(formData, 'definitionId') ?? '';
    const result = await withOrgContext((context) =>
      generateRecurrenceOccurrences(context, { definitionId, horizonDays: 30 }),
    );
    revalidatePath('/service/recurring');
    revalidatePath(`/service/recurring/${definitionId}`);
    return { success: true, generatedCount: result.generated.length };
  } catch (error) {
    return await mapError(error);
  }
}

export async function pauseRecurrenceAction(
  _prev: RecurrenceFormState,
  formData: FormData,
): Promise<RecurrenceFormState> {
  try {
    const definitionId = formValue(formData, 'definitionId') ?? '';
    await withOrgContext((context) => pauseRecurrenceDefinition(context, { definitionId }));
    revalidatePath('/service/recurring');
    revalidatePath(`/service/recurring/${definitionId}`);
    return { success: true };
  } catch (error) {
    return await mapError(error);
  }
}

export async function resumeRecurrenceAction(
  _prev: RecurrenceFormState,
  formData: FormData,
): Promise<RecurrenceFormState> {
  try {
    const definitionId = formValue(formData, 'definitionId') ?? '';
    await withOrgContext((context) => resumeRecurrenceDefinition(context, { definitionId }));
    revalidatePath('/service/recurring');
    revalidatePath(`/service/recurring/${definitionId}`);
    return { success: true };
  } catch (error) {
    return await mapError(error);
  }
}

export async function endRecurrenceAction(
  _prev: RecurrenceFormState,
  formData: FormData,
): Promise<RecurrenceFormState> {
  try {
    const definitionId = formValue(formData, 'definitionId') ?? '';
    await withOrgContext((context) => endRecurrenceDefinition(context, { definitionId }));
    revalidatePath('/service/recurring');
    revalidatePath(`/service/recurring/${definitionId}`);
    return { success: true };
  } catch (error) {
    return await mapError(error);
  }
}

export async function skipRecurrenceAction(
  _prev: RecurrenceFormState,
  formData: FormData,
): Promise<RecurrenceFormState> {
  try {
    const definitionId = formValue(formData, 'definitionId') ?? '';
    await withOrgContext((context) =>
      skipRecurrenceOccurrence(context, {
        definitionId,
        occurrenceDate: formValue(formData, 'occurrenceDate') ?? '',
        reason: formValue(formData, 'reason'),
      }),
    );
    revalidatePath('/service/recurring');
    revalidatePath(`/service/recurring/${definitionId}`);
    return { success: true };
  } catch (error) {
    return await mapError(error);
  }
}
