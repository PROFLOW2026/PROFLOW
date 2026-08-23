'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { cancelCalendarEvent, createCalendarEvent } from '@/modules/calendar';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

export interface CalendarFormState {
  error?: string;
  success?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

async function mapError(error: unknown): Promise<CalendarFormState> {
  const tErrors = await getTranslations('errors');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
  });
}

export async function createEventAction(
  _prev: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const t = await getTranslations('calendar');
  try {
    await withOrgContext((context) =>
      createCalendarEvent(context, {
        title: formValue(formData, 'title') ?? '',
        notes: formValue(formData, 'notes') ?? null,
        eventKind: (formValue(formData, 'eventKind') as 'meeting' | 'site_visit' | 'other') ?? 'meeting',
        eventDate: formValue(formData, 'eventDate') ?? '',
        allDay: formData.get('allDay') === 'on',
        projectId: formValue(formData, 'projectId') ?? null,
      }),
    );
    revalidatePath('/calendar');
    return { success: t('actions.saved') };
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelEventAction(eventId: string): Promise<void> {
  await withOrgContext((context) => cancelCalendarEvent(context, eventId));
  revalidatePath('/calendar');
}
