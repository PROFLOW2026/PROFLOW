'use server';

import { redirect as nextRedirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  activateContractorAccount,
  requestContractorPasswordReset,
  resetContractorPassword,
  signInContractor,
} from '@/modules/contractor-access';
import {
  clientIpHash,
  contractorAuthDeps,
  contractorErrorState,
  type ContractorFormState,
} from '@/modules/contractor-access/application/action-support';
import { safeContractorNext } from '@/modules/contractor-access/domain/surface';
import { signInSchema, tokenPasswordSchema } from '@/modules/contractor-access/validation/schemas';
import { isLocale, type Locale } from '@/shared/i18n/config';
import { isRedirectError } from '@/modules/workforce/application/map-workforce-action-error';

async function activeLocale(): Promise<Locale> {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'he-IL';
}

function preferredLocale(principalLocale: string | null, fallback: Locale): Locale {
  return principalLocale && isLocale(principalLocale) ? principalLocale : fallback;
}

export async function contractorSignInAction(
  _prev: ContractorFormState,
  formData: FormData,
): Promise<ContractorFormState> {
  const t = await getTranslations('contractorAccess');
  const locale = await activeLocale();
  const parsed = signInSchema.safeParse({
    username: formData.get('username') ?? '',
    password: formData.get('password') ?? '',
  });
  const username = String(formData.get('username') ?? '');
  if (!parsed.success) return { error: t('errors.invalid_credentials'), values: { username } };

  try {
    const result = await signInContractor(contractorAuthDeps(), { ...parsed.data, ipHash: await clientIpHash() });
    if (!result.ok) return { error: t(`errors.${result.reason}`), values: { username } };
    const target = preferredLocale(result.locale, locale);
    nextRedirect(safeContractorNext(String(formData.get('next') ?? ''), target));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ...contractorErrorState(t, error), values: { username } };
  }
}

async function setPasswordAndSignIn(
  formData: FormData,
  mode: 'activate' | 'reset',
): Promise<ContractorFormState> {
  const t = await getTranslations('contractorAccess');
  const locale = await activeLocale();
  const parsed = tokenPasswordSchema.safeParse({
    token: formData.get('token') ?? '',
    password: formData.get('password') ?? '',
    confirmation: formData.get('confirmation') ?? '',
  });
  if (!parsed.success) return { error: t('errors.invalid_link') };

  try {
    const deps = contractorAuthDeps();
    const result =
      mode === 'activate' ? await activateContractorAccount(deps, parsed.data) : await resetContractorPassword(deps, parsed.data);
    if (!result.ok) return { error: t(`errors.link_${result.reason}`) };
    const signedIn = await signInContractor(deps, {
      username: result.username,
      password: parsed.data.password,
      ipHash: await clientIpHash(),
    });
    const target = preferredLocale(result.locale, locale);
    nextRedirect(signedIn.ok ? `/${target}/contractor` : `/${target}/contractor/sign-in`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return contractorErrorState(t, error);
  }
}

export async function contractorActivateAction(_prev: ContractorFormState, formData: FormData) {
  return setPasswordAndSignIn(formData, 'activate');
}

export async function contractorResetPasswordAction(_prev: ContractorFormState, formData: FormData) {
  return setPasswordAndSignIn(formData, 'reset');
}

export async function contractorForgotPasswordAction(
  _prev: ContractorFormState,
  formData: FormData,
): Promise<ContractorFormState> {
  const t = await getTranslations('contractorAccess');
  const username = String(formData.get('username') ?? '').slice(0, 64);
  try {
    await requestContractorPasswordReset(contractorAuthDeps(), { username, ipHash: await clientIpHash() });
  } catch (error) {
    console.error('[contractorForgotPasswordAction] failed', error);
  }
  // Same answer whether or not the account exists.
  return { success: t('auth.forgot.sent') };
}
