'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  runNotificationScanAction,
} from '../application/actions';
import type { NotificationInboxDto } from '../application/serialize';
import { NotificationPanel } from './notification-panel';

function inboxOrEmpty(value: NotificationInboxDto | null | undefined): NotificationInboxDto {
  return value ?? { items: [], unreadCount: 0 };
}

export function NotificationBell({
  initialInbox,
  loadInbox,
}: {
  readonly initialInbox?: NotificationInboxDto;
  readonly loadInbox?: () => Promise<NotificationInboxDto>;
} = {}) {
  const t = useTranslations('notifications');
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'error' | 'ready'>(
    initialInbox ? 'ready' : 'idle',
  );
  const [inbox, setInbox] = React.useState<NotificationInboxDto>(inboxOrEmpty(initialInbox));
  const [scanning, setScanning] = React.useState(false);

  const fetchInbox = React.useCallback(async () => {
    setStatus('loading');
    try {
      const next = loadInbox ? await loadInbox() : await listNotificationsAction();
      setInbox(next);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [loadInbox]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void fetchInbox();
  }

  async function handleMarkRead(id: string) {
    try {
      const next = await markNotificationReadAction(id);
      setInbox(next);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  async function handleMarkAllRead() {
    try {
      const next = await markAllNotificationsReadAction();
      setInbox(next);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  async function handleScan() {
    setScanning(true);
    try {
      const result = await runNotificationScanAction();
      setInbox(result.inbox);
      setStatus('ready');
    } catch {
      setStatus('error');
    } finally {
      setScanning(false);
    }
  }

  const unread = inbox.unreadCount;
  const label = unread > 0 ? `${t('bellLabel')}. ${t('unreadCount', { count: unread })}` : t('bellLabel');

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            pressableChromeClassName,
            'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2',
            'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
            'active:bg-[var(--pf-action-subtle-active)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
          )}
          aria-label={label}
        >
          <Bell className="size-4.5" aria-hidden />
          {unread > 0 ? (
            <span
              className="absolute top-1.5 end-1.5 flex min-w-4.5 justify-center rounded-full bg-[var(--pf-action-danger)] px-1 text-[0.65rem] font-semibold leading-4 text-[var(--pf-text-inverse)]"
              aria-hidden
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(100vw-2rem,24rem)] p-0"
        aria-label={t('title')}
      >
        <NotificationPanel
          items={inbox.items}
          unreadCount={inbox.unreadCount}
          status={status === 'idle' ? 'ready' : status}
          onMarkRead={(id) => void handleMarkRead(id)}
          onMarkAllRead={() => void handleMarkAllRead()}
          onRetry={() => void fetchInbox()}
          onScan={() => void handleScan()}
          scanning={scanning}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
