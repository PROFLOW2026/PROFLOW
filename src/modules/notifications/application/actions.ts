'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
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
  return withOrgContext(async (context) => toNotificationInboxDto(await listNotifications(context)));
}

export async function markNotificationReadAction(notificationId: string): Promise<NotificationInboxDto> {
  return withOrgContext(async (context) => {
    await markNotificationRead(context, { notificationId });
    revalidatePath('/notifications');
    return toNotificationInboxDto(await listNotifications(context));
  });
}

export async function markAllNotificationsReadAction(): Promise<NotificationInboxDto> {
  return withOrgContext(async (context) => {
    await markAllNotificationsRead(context);
    revalidatePath('/notifications');
    return toNotificationInboxDto(await listNotifications(context));
  });
}

export async function runNotificationScanAction(): Promise<{
  readonly scan: NotificationScanResult;
  readonly inbox: NotificationInboxDto;
}> {
  return withOrgContext(async (context) => {
    const scan = await runNotificationScan(context, { maxMs: 4000, perScannerCap: 15 });
    revalidatePath('/notifications');
    return { scan, inbox: toNotificationInboxDto(await listNotifications(context)) };
  });
}
