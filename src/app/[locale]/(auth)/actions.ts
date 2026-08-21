'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import {
  MIN_PASSWORD_LENGTH,
  isPasswordLongEnough,
  passwordsMatch,
} from '@/shared/auth/password-policy';
import { buildAuthCallbackUrl, safeAppPath } from '@/shared/i18n/auth-locale';
import { isLocale, type Locale } from '@/shared/i18n/config';
import { redirect } from '@/shared/i18n/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';

/**
 * Credential flows (doc 72 §4).
 *
 * Supabase handles the credentials; these actions only translate the outcome.
 * Messages are deliberately non-enumerating - the sign-in failure and the
 * password-reset response never reveal whether an account exists.
 * Passwords are never logged.
 */

export interface AuthFormState {
  error?: string;
  notice?: string;
  email?: string;
}

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  confirmPassword: z.string().min(1),
  displayName: z.string().trim().min(1).max(120),
});

const emailSchema = z.object({ email: z.email() });

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: t('signIn.invalidCredentials') };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t('signIn.invalidCredentials'), email: parsed.data.email };

  const locale = await activeLocale();
  redirect({ href: safeAppPath(stringField(formData.get('next'))) ?? '/', locale });
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const tValidation = await getTranslations('validation');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const email = stringField(formData.get('email')) ?? '';
  const password = stringField(formData.get('password')) ?? '';
  const confirmPassword = stringField(formData.get('confirmPassword')) ?? '';
  const displayName = stringField(formData.get('displayName')) ?? '';

  if (!isPasswordLongEnough(password)) {
    return { error: tValidation('passwordTooWeak'), email };
  }
  if (!passwordsMatch(password, confirmPassword)) {
    return { error: tValidation('passwordsDoNotMatch'), email };
  }

  const parsed = signUpSchema.safeParse({
    email,
    password,
    confirmPassword,
    displayName,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path.includes('email')) return { error: tValidation('invalidEmail'), email };
    if (issue?.path.includes('password')) return { error: tValidation('passwordTooWeak'), email };
    if (issue?.path.includes('displayName')) return { error: tValidation('required'), email };
    return { error: tValidation('required'), email };
  }

  // confirmPassword is validated only — never sent to Auth or stored.
  const locale = await activeLocale();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName, locale_preference: locale },
      emailRedirectTo: buildAuthCallbackUrl(await originUrl(), locale, '/onboarding'),
    },
  });

  if (error) {
    return { error: mapSignUpProviderError(error.message, t, tValidation), email: parsed.data.email };
  }

  // With email confirmation on, there is no session yet; tell the user to check
  // their inbox rather than dropping them on a sign-in screen with no context.
  if (!data.session) return { notice: 'check-email', email: parsed.data.email };

  redirect({ href: '/onboarding', locale });
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const parsed = emailSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: t('signIn.invalidCredentials') };

  const locale = await activeLocale();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildAuthCallbackUrl(await originUrl(), locale, '/reset-password'),
  });

  // Always the same answer, whether or not the address is registered.
  return { notice: 'sent', email: parsed.data.email };
}

export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const tValidation = await getTranslations('validation');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (!isPasswordLongEnough(password)) return { error: tValidation('passwordTooWeak') };
  if (!passwordsMatch(password, confirm)) return { error: tValidation('passwordsDoNotMatch') };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: t('resetPassword.linkExpired') };

  redirect({ href: '/', locale: await activeLocale() });
}

function mapSignUpProviderError(
  message: string,
  t: Awaited<ReturnType<typeof getTranslations<'auth'>>>,
  tValidation: Awaited<ReturnType<typeof getTranslations<'validation'>>>,
): string {
  const lower = message.toLowerCase();
  if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
    return t('signUp.emailAlreadyRegistered');
  }
  if (lower.includes('password') && (lower.includes('short') || lower.includes('least') || lower.includes('weak'))) {
    return tValidation('passwordTooWeak');
  }
  if (lower.includes('email') && (lower.includes('invalid') || lower.includes('valid'))) {
    return tValidation('invalidEmail');
  }
  return t('signUp.failed');
}

async function activeLocale(): Promise<Locale> {
  const locale = await getLocale();
  return isLocale(locale) ? locale : 'he-IL';
}

function stringField(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}

async function originUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const { headers } = await import('next/headers');
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}
