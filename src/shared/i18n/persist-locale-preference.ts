'use server';

import { revalidateTag } from 'next/cache';
import { findProfile, updateProfile } from '@/modules/identity';
import { sessionDbCacheTag } from '@/shared/auth/cached-session-db';
import { isDatabaseConfigured, withUserContext } from '@/shared/db/client';
import { createSupabaseServerClient, getSupabaseUser } from '@/shared/supabase/server';
import { resolveAuthLocale } from '@/shared/i18n/auth-locale';
import { isLocale, type Locale } from '@/shared/i18n/config';

/**
 * After authentication, honour an explicit profile locale over the URL the
 * user signed in from so "English selected → English persists" holds.
 */
export async function resolveLocaleAfterAuth(
  userId: string | undefined | null,
  urlLocale: Locale,
): Promise<Locale> {
  if (!userId || !isDatabaseConfigured()) {
    return resolveAuthLocale([urlLocale]);
  }

  const profileLocale = await withUserContext(userId, async (tx) => {
    const profile = await findProfile(tx, userId);
    return profile?.localePreference ?? null;
  });

  return resolveAuthLocale([profileLocale, urlLocale]);
}

/** Persist the user's UI locale to profile (and auth metadata when signed in). */
export async function persistLocalePreferenceAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  const authUser = await getSupabaseUser();
  if (!authUser?.id || !isDatabaseConfigured()) return;

  await withUserContext(authUser.id, async (tx) => {
    await updateProfile(tx, authUser.id, { localePreference: locale });
  });

  const supabase = await createSupabaseServerClient();
  await supabase.auth.updateUser({ data: { locale_preference: locale } });

  revalidateTag(sessionDbCacheTag(authUser.id), 'max');
}
