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
import { mapServerActionError } from '@/shared/errors';
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

  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    fieldMessageOverrides: {
      'validation.endBeforeStart': tValidation('endBeforeStart'),
    },
    namespaces: {
      service: (key) => {
        // keys like errors.recurrenceNotActive → service.recurring.errors.*
        if (key.startsWith('errors.')) {
          return tService(key as 'errors.recurrenceNotActive');
        }
        return tService(`errors.${key}` as 'errors.recurrenceNotActive');
      },
    },
  });
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
    return await mapError(error);
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
