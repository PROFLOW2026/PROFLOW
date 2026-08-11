'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { createOrganization, createOrganizationSchema } from '@/modules/tenancy';
import { setActiveOrganizationPreference } from '@/modules/identity';
import { requireSession } from '@/shared/auth/session';
import { withUserContext } from '@/shared/db/client';
import { AppError } from '@/shared/errors';
import { isLocale } from '@/shared/i18n/config';
import { redirect } from '@/shared/i18n/navigation';

export interface OnboardingFormState {
  error?: string;
}

export async function createOrganizationAction(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const tErrors = await getTranslations('errors');
  const session = await requireSession();
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'he-IL';

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get('name'),
    countryCode: formData.get('countryCode'),
    defaultLocale: locale,
    businessProfile: formData.get('businessProfile'),
    professionPreset: formData.get('professionPreset'),
  });
  if (!parsed.success) return { error: tErrors('validationFailed') };

  try {
    await withUserContext(session.user.id, async (tx) => {
      const result = await createOrganization(tx, session.user.id, parsed.data);
      await setActiveOrganizationPreference(tx, session.user.id, result.organization.id);
    });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  revalidatePath('/', 'layout');
  redirect({ href: '/', locale });
}
