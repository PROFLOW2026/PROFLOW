'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { NotificationListItemDto } from '../application/serialize';

function severityShape(severity: NotificationListItemDto['severity']): StatusShape {
  if (severity === 'urgent') return 'overdue';
  if (severity === 'warning') return 'onHold';
  return 'pending';
}

export interface NotificationPanelProps {
  readonly items: readonly NotificationListItemDto[];
  readonly unreadCount: number;
  readonly status: 'loading' | 'error' | 'ready';
  readonly onMarkRead: (id: string) => void;
  readonly onMarkAllRead: () => void;
  readonly onRetry: () => void;
  readonly onScan?: () => void;
  readonly scanning?: boolean;
  readonly onNavigate?: () => void;
}

export function NotificationPanel({
  items,
  unreadCount,
  status,
  onMarkRead,
  onMarkAllRead,
  onRetry,
  onScan,
  scanning = false,
  onNavigate,
}: NotificationPanelProps) {
  const t = useTranslations('notifications');

  if (status === 'loading') {
    return (
      <div className="flex min-h-40 items-center justify-center px-4 py-8">
        <Spinner label={t('loading')} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('error')}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        size="sm"
        title={t('empty')}
        description={t('emptyHint')}
        action={
          onScan ? (
            <Button type="button" variant="secondary" size="sm" loading={scanning} onClick={onScan}>
              {t('scan')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--pf-border-default)] px-3 py-2">
        <p className="text-xs text-[var(--pf-text-muted)]">
          {unreadCount > 0 ? t('unreadCount', { count: unreadCount }) : t('allCaughtUp')}
        </p>
        <div className="flex items-center gap-1">
          {onScan ? (
            <Button type="button" variant="ghost" size="sm" loading={scanning} onClick={onScan}>
              {t('scan')}
            </Button>
          ) : null}
          {unreadCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onMarkAllRead}>
              {t('markAllRead')}
            </Button>
          ) : null}
        </div>
      </div>
      <ul className="max-h-[min(24rem,60dvh)] overflow-y-auto" aria-label={t('title')}>
        {items.map((item) => {
          const unread = !item.readAt;
          const content = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge shape={severityShape(item.severity)} label={t(`severity.${item.severity}`)} />
                <span className="text-xs text-[var(--pf-text-muted)]">{t(`types.${item.type}`)}</span>
              </div>
              <p className="mt-1 text-sm font-medium leading-snug">{item.title}</p>
              <p className="mt-0.5 text-sm text-[var(--pf-text-secondary)]">{item.body}</p>
            </>
          );

          return (
            <li
              key={item.id}
              className={cn(
                'border-b border-[var(--pf-border-default)] last:border-b-0',
                unread && 'bg-[var(--pf-bg-muted)]',
              )}
            >
              {item.deepLink ? (
                <Link
                  href={item.deepLink}
                  className="block min-h-11 px-3 py-2.5 text-start hover:bg-[var(--pf-action-subtle-hover)]"
                  onClick={() => {
                    if (unread) onMarkRead(item.id);
                    onNavigate?.();
                  }}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  className="block w-full min-h-11 px-3 py-2.5 text-start hover:bg-[var(--pf-action-subtle-hover)]"
                  onClick={() => {
                    if (unread) onMarkRead(item.id);
                  }}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-[var(--pf-border-default)] px-3 py-2">
        <Link
          href="/notifications"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)]"
          onClick={() => onNavigate?.()}
        >
          {t('viewAll')}
        </Link>
      </div>
    </div>
  );
}
