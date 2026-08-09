'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';
import { setActiveOrganization } from './session';

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect({ href: '/sign-in', locale: await getLocale() });
}

export async function switchOrganizationAction(organizationId: string): Promise<void> {
  await setActiveOrganization(organizationId);
  revalidatePath('/', 'layout');
  redirect({ href: '/', locale: await getLocale() });
}
