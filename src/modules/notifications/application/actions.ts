'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { localizeNotificationInbox } from './localize-notifications';
import { isActionableNotificationId } from './actionable-inbox';
import { listNotifications } from './list';
import { markNotificationRead } from './mark-read';
import { markAllNotificationsRead } from './mark-all-read';
import { runNotificationScan } from './scan-conditions';
import { toNotificationInboxDto } from './serialize';
import type { NotificationInboxDto } from './serialize';
import type { NotificationScanResult } from '../domain/types';

export type { NotificationInboxDto } from './serialize';
export type { NotificationListItemDto } from './serialize';

export async function listNotificationsAction(): Promise<NotificationInboxDto> {
  const t = await getTranslations('notifications');
  return withOrgContext(async (context) =>
    toNotificationInboxDto(localizeNotificationInbox(await listNotifications(context), t)),
  );
}

export async function markNotificationReadAction(notificationId: string): Promise<NotificationInboxDto> {
  return withOrgContext(async (context) => {
    if (!isActionableNotificationId(notificationId)) {
      await markNotificationRead(context, { notificationId });
    }
    revalidatePath('/notifications');
    const t = await getTranslations('notifications');
    return toNotificationInboxDto(
      localizeNotificationInbox(await listNotifications(context), t),
    );
  });
}

export async function markAllNotificationsReadAction(): Promise<NotificationInboxDto> {
  const t = await getTranslations('notifications');
  return withOrgContext(async (context) => {
    await markAllNotificationsRead(context);
    revalidatePath('/notifications');
    return toNotificationInboxDto(
      localizeNotificationInbox(await listNotifications(context), t),
    );
  });
}

export async function runNotificationScanAction(): Promise<{
  readonly scan: NotificationScanResult;
  readonly inbox: NotificationInboxDto;
}> {
  return withOrgContext(async (context) => {
    const scan = await runNotificationScan(context, { maxMs: 4000, perScannerCap: 15 });
    revalidatePath('/notifications');
    const t = await getTranslations('notifications');
    return {
      scan,
      inbox: toNotificationInboxDto(
        localizeNotificationInbox(await listNotifications(context), t),
      ),
    };
  });
}
