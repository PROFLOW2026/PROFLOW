'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  countFailedInQueueIndex,
  countPendingInQueueIndex,
} from '../data/queue-index';
import { useOfflineScope } from './use-offline-aware-form-action';
import { textNavLinkClassName } from '@/components/ui/pressable';

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Sticky banner when the browser reports offline, or when failed syncs need attention.
 * Service worker registration lives in `PwaBootstrap` (locale layout, production only).
 */
export function ConnectivityBanner() {
  const t = useTranslations('offline');
  const scope = useOfflineScope();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    const refreshCounts = () => {
      setPendingCount(
        countPendingInQueueIndex(
          scope
            ? { organizationId: scope.organizationId, userId: scope.userId }
            : undefined,
        ),
      );
      setFailedCount(
        countFailedInQueueIndex(
          scope
            ? { organizationId: scope.organizationId, userId: scope.userId }
            : undefined,
        ),
      );
    };

    const onOnline = () => {
      setOnline(true);
      refreshCounts();
    };
    const onOffline = () => {
      setOnline(false);
      refreshCounts();
    };
    const frame = window.requestAnimationFrame(() => {
      setOnline(readOnline());
      refreshCounts();
    });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', refreshCounts);
    const interval = window.setInterval(refreshCounts, 4000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', refreshCounts);
    };
  }, [scope]);

  if (online && failedCount === 0 && pendingCount === 0) return null;

  const showOffline = !online;
  const showFailed = online && failedCount > 0;
  const showPending = online && failedCount === 0 && pendingCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      data-pf-connectivity={online ? (failedCount > 0 ? 'sync-failed' : 'pending') : 'offline'}
      className={cn(
        'border-b border-[var(--pf-border-default)] px-4 py-2 text-sm text-[var(--pf-text-primary)]',
        showFailed
          ? 'bg-[var(--pf-status-warning-bg,var(--pf-bg-muted))]'
          : 'bg-[var(--pf-bg-muted)]',
      )}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          {showOffline
            ? t('banner.offlineWithCount', { count: pendingCount })
            : showFailed
              ? t('banner.failedSync', { count: failedCount })
              : showPending
                ? t('banner.pendingSync', { count: pendingCount })
                : t('banner.offline')}
        </p>
        <Link
          href="/settings/offline-drafts"
          className={cn(textNavLinkClassName, 'rounded-sm font-medium')}
        >
          {t('banner.viewDrafts')}
        </Link>
      </div>
    </div>
  );
}

/** Compact online/offline + pending chip for toolbars. */
export function ConnectivityIndicator({ className }: { className?: string }) {
  const t = useTranslations('offline');
  const scope = useOfflineScope();
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    const refreshCounts = () => {
      setPendingCount(
        countPendingInQueueIndex(
          scope
            ? { organizationId: scope.organizationId, userId: scope.userId }
            : undefined,
        ),
      );
      setFailedCount(
        countFailedInQueueIndex(
          scope
            ? { organizationId: scope.organizationId, userId: scope.userId }
            : undefined,
        ),
      );
    };
    const onOnline = () => {
      setOnline(true);
      refreshCounts();
    };
    const onOffline = () => {
      setOnline(false);
      refreshCounts();
    };
    const frame = window.requestAnimationFrame(() => {
      setOnline(readOnline());
      refreshCounts();
    });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = window.setInterval(refreshCounts, 4000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [scope]);

  const label = !online
    ? t('indicator.offline')
    : failedCount > 0
      ? t('indicator.failed', { count: failedCount })
      : pendingCount > 0
        ? t('indicator.pending', { count: pendingCount })
        : t('indicator.online');

  return (
    <span
      role="status"
      aria-live="polite"
      data-pf-connectivity={
        !online ? 'offline' : failedCount > 0 ? 'sync-failed' : pendingCount > 0 ? 'pending' : 'online'
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
        !online || failedCount > 0
          ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'
          : 'text-[var(--pf-text-secondary)]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          !online
            ? 'bg-[var(--pf-status-warning-fg)]'
            : failedCount > 0
              ? 'bg-[var(--pf-status-danger-fg)]'
              : pendingCount > 0
                ? 'bg-[var(--pf-status-warning-fg)]'
                : 'bg-[var(--pf-status-success-fg)]',
        )}
      />
      <span className="sr-only sm:not-sr-only sm:inline">{label}</span>
    </span>
  );
}
