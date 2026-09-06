import { listMergedNotificationInbox } from '../application/actionable-inbox';
import { toNotificationInboxDto } from '../application/serialize';
import { withOrgContext } from '@/shared/auth/session';
import { NotificationBell } from './notification-bell';

/** Server-prefetched bell so badge count is correct before the popover opens. */
export async function NotificationBellLoader() {
  const initialInbox = await withOrgContext(async (context) =>
    toNotificationInboxDto(await listMergedNotificationInbox(context)),
  );
  return <NotificationBell initialInbox={initialInbox} />;
}
