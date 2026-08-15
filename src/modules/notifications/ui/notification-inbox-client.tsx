'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  runNotificationScanAction,
} from '../application/actions';
import type { NotificationInboxDto } from '../application/serialize';
import { NotificationPanel } from './notification-panel';

export function NotificationInboxClient({ initialInbox }: { readonly initialInbox: NotificationInboxDto }) {
  const t = useTranslations('notifications');
  const [status, setStatus] = React.useState<'loading' | 'error' | 'ready'>('ready');
  const [inbox, setInbox] = React.useState(initialInbox);
  const [scanning, setScanning] = React.useState(false);

  async function refresh() {
    setStatus('loading');
    try {
      setInbox(await listNotificationsAction());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={scanning}
          onClick={() => {
            void (async () => {
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
            })();
          }}
        >
          {t('scan')}
        </Button>
      </div>
      <Card className="overflow-hidden p-0">
        <NotificationPanel
          items={inbox.items}
          unreadCount={inbox.unreadCount}
          status={status}
          onMarkRead={(id) => {
            void markNotificationReadAction(id)
              .then((next) => {
                setInbox(next);
                setStatus('ready');
              })
              .catch(() => setStatus('error'));
          }}
          onMarkAllRead={() => {
            void markAllNotificationsReadAction()
              .then((next) => {
                setInbox(next);
                setStatus('ready');
              })
              .catch(() => setStatus('error'));
          }}
          onRetry={() => void refresh()}
          scanning={scanning}
        />
      </Card>
    </div>
  );
}
