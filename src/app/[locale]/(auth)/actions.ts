'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { redirect } from '@/shared/i18n/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';

/**
 * Credential flows (doc 72 §4).
 *
 * Supabase handles the credentials; these actions only translate the outcome.
 * Messages are deliberately non-enumerating — the sign-in failure and the
 * password-reset response never reveal whether an account exists.
 */

export interface AuthFormState {
  error?: string;
  notice?: string;
  email?: string;
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(10),
});

const emailSchema = z.object({ email: z.email() });

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: t('signIn.invalidCredentials') };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t('signIn.invalidCredentials'), email: parsed.data.email };

  redirect({ href: safeReturnPath(formData.get('next')) ?? '/', locale: await getLocale() });
}

/**
 * Only same-site, path-relative destinations survive. Anything else — an
 * absolute URL, a protocol-relative `//host` — is dropped, so a crafted sign-in
 * link cannot bounce a freshly authenticated user off to another origin.
 */
function safeReturnPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  const tErrors = await getTranslations('errors');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const parsed = credentialsSchema
    .extend({ displayName: z.string().trim().min(1).max(120) })
    .safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      displayName: formData.get('displayName'),
    });
  if (!parsed.success) return { error: tErrors('validationFailed') };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await originUrl()}/auth/callback`,
    },
  });

  if (error) return { error: error.message, email: parsed.data.email };

  // With email confirmation on, there is no session yet; tell the user to check
  // their inbox rather than dropping them on a sign-in screen with no context.
  if (!data.session) return { notice: 'check-email', email: parsed.data.email };

  redirect({ href: '/onboarding', locale: await getLocale() });
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations('auth');
  if (!isSupabaseConfigured()) return { error: t('setup.title') };

  const parsed = emailSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: t('signIn.invalidCredentials') };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await originUrl()}/auth/callback?next=/reset-password`,
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

  if (password.length < 10) return { error: tValidation('passwordTooWeak') };
  if (password !== confirm) return { error: tValidation('passwordsDoNotMatch') };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: t('resetPassword.linkExpired') };

  redirect({ href: '/', locale: await getLocale() });
}

async function originUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const { headers } = await import('next/headers');
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}
