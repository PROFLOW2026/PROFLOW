'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { requireExternalContext } from '@/modules/contractor-access';
import { NotFoundError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';
import { PORTAL_BASE_PATH, PORTAL_SIGN_IN_PATH } from '../domain/routes';
import { PORTAL_NOTIFICATION_SOURCE } from './registry';

/** Contractor sign-out - always lands on the contractor sign-in, never the org app. */
export async function contractorPortalSignOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  revalidatePath(PORTAL_BASE_PATH, 'layout');
  redirect({ href: PORTAL_SIGN_IN_PATH, locale: await getLocale() });
}

const notificationIdSchema = z.string().uuid();

export async function markPortalNotificationReadAction(notificationId: string): Promise<void> {
  if (!PORTAL_NOTIFICATION_SOURCE) return;
  const id = notificationIdSchema.safeParse(notificationId);
  if (!id.success) return;
  const context = await requireExternalContext();
  try {
    await PORTAL_NOTIFICATION_SOURCE.markRead(context, id.data);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  revalidatePath(PORTAL_BASE_PATH, 'layout');
}

export async function markAllPortalNotificationsReadAction(): Promise<void> {
  if (!PORTAL_NOTIFICATION_SOURCE) return;
  const context = await requireExternalContext();
  await PORTAL_NOTIFICATION_SOURCE.markAllRead(context);
  revalidatePath(PORTAL_BASE_PATH, 'layout');
}
