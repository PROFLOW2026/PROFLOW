'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { createTimeEntry, createTimeEntrySchema } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface TimeEntryFormState {
  error?: string;
  /** Local draft queued — not server truth. */
  offlineQueued?: boolean;
}

export async function createTimeEntryAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const parsed = createTimeEntrySchema.safeParse({
    employeeId: formData.get('employeeId'),
    workDate: formData.get('workDate'),
    hours: formData.get('hours'),
    kind: formData.get('kind') ?? 'project',
    projectId: formData.get('projectId') || null,
    workPackageId: formData.get('workPackageId') || null,
    phaseId: formData.get('phaseId') || null,
    timeCodeId: formData.get('timeCodeId') || null,
    description: formData.get('description') || null,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => createTimeEntry(context, parsed.data));
    revalidatePath('/workforce', 'layout');
    redirect({ href: '/workforce/time', locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}
