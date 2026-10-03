'use server';

import { revalidatePath } from 'next/cache';
import { redirect as nextRedirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  changeContractorPassword,
  requireExternalContext,
  updateContractorProfile,
} from '@/modules/contractor-access';
import {
  contractorAuthDeps,
  contractorErrorState,
  type ContractorFormState,
} from '@/modules/contractor-access/application/action-support';
import { changePasswordSchema, profileSchema } from '@/modules/contractor-access/validation/schemas';
import { isLocale } from '@/shared/i18n/config';
import { isRedirectError } from '@/modules/workforce/application/map-workforce-action-error';

export async function contractorUpdateProfileAction(
  _prev: ContractorFormState,
  formData: FormData,
): Promise<ContractorFormState> {
  const t = await getTranslations('contractorAccess');
  const context = await requireExternalContext();
  const parsed = profileSchema.safeParse({
    displayName: formData.get('displayName') ?? '',
    phone: formData.get('phone') ?? '',
    locale: formData.get('locale') ?? '',
  });
  if (!parsed.success) return { error: t('errors.validation') };
  try {
    await updateContractorProfile(context, { ...parsed.data, phone: parsed.data.phone });
  } catch (error) {
    return contractorErrorState(t, error);
  }
  const current = await getLocale();
  if (parsed.data.locale !== current && isLocale(parsed.data.locale)) {
    nextRedirect(`/${parsed.data.locale}/contractor/account`);
  }
  revalidatePath(`/${current}/contractor/account`);
  return { success: t('account.profile.saved') };
}

export async function contractorChangePasswordAction(
  _prev: ContractorFormState,
  formData: FormData,
): Promise<ContractorFormState> {
  const t = await getTranslations('contractorAccess');
  const context = await requireExternalContext();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') ?? '',
    newPassword: formData.get('newPassword') ?? '',
    confirmation: formData.get('confirmation') ?? '',
  });
  if (!parsed.success) return { error: t('errors.validation') };
  try {
    await changeContractorPassword(context, contractorAuthDeps(), parsed.data);
    return { success: t('account.password.changed') };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return contractorErrorState(t, error);
  }
}

export async function contractorSignOutAction(): Promise<void> {
  await contractorAuthDeps().auth.signOutCurrent();
  const locale = await getLocale();
  nextRedirect(`/${isLocale(locale) ? locale : 'he-IL'}/contractor/sign-in`);
}
