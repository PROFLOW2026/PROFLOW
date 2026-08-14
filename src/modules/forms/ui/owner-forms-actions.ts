'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from '@/shared/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createFormSubmission, FORM_OWNER_TYPES } from '@/modules/forms';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface FormsActionState {
  ok?: boolean;
  error?: string;
  submissionId?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function startOwnerSubmissionAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  const templateId = formValue(formData, 'templateId');
  const ownerType = formValue(formData, 'ownerType');
  const ownerId = formValue(formData, 'ownerId');

  if (
    !templateId ||
    !ownerType ||
    !ownerId ||
    !(FORM_OWNER_TYPES as readonly string[]).includes(ownerType)
  ) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const submission = await withOrgContext((context) =>
      createFormSubmission(context, {
        templateId,
        ownerType: ownerType as (typeof FORM_OWNER_TYPES)[number],
        ownerId,
      }),
    );
    revalidatePath('/forms');
    if (ownerType === 'work_order') {
      revalidatePath(`/work-orders/${ownerId}`);
    }
    redirect({ href: `/forms/${submission.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}
