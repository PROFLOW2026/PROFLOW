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

/** Opening a material alert only navigates. Other types still mark read on open. */
export function notificationOpenMarksRead(type: NotificationListItemDto['type']): boolean {
  return type !== 'material_pressure_alert';
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
  /**
   * `compact` (default): popover density — clamped title/body and capped list height.
   * `full`: notifications page — full text, taller scroll region.
   */
  readonly density?: 'compact' | 'full';
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
  density = 'compact',
}: NotificationPanelProps) {
  const t = useTranslations('notifications');
  const compact = density === 'compact';

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
      <ul
        className={cn(
          'overflow-y-auto',
          compact ? 'max-h-[min(20rem,45dvh)]' : 'max-h-[min(36rem,70dvh)]',
        )}
        aria-label={t('title')}
      >
        {items.map((item) => {
          const unread = !item.readAt;
          const content = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge shape={severityShape(item.severity)} label={t(`severity.${item.severity}`)} />
                <span className="text-xs text-[var(--pf-text-muted)]">{t(`types.${item.type}`)}</span>
              </div>
              <p
                className={cn(
                  'mt-1 text-sm font-medium leading-snug',
                  compact && 'line-clamp-2',
                )}
              >
                {item.title}
              </p>
              <p
                className={cn(
                  'mt-0.5 text-sm text-[var(--pf-text-secondary)]',
                  compact && 'line-clamp-3',
                )}
              >
                {item.body}
              </p>
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
              {item.type === 'material_pressure_alert' ? (
                <div className="flex items-start gap-2">
                  {item.deepLink ? (
                    <Link
                      href={item.deepLink}
                      className="block min-h-11 min-w-0 flex-1 px-3 py-2.5 text-start hover:bg-[var(--pf-action-subtle-hover)]"
                      onClick={() => onNavigate?.()}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="block min-h-11 min-w-0 flex-1 px-3 py-2.5 text-start">{content}</div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="me-2 mt-2 shrink-0"
                    onClick={() => onMarkRead(item.id)}
                  >
                    {t('markRead')}
                  </Button>
                </div>
              ) : item.deepLink ? (
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
