'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Sticky banner when the browser reports offline.
 * Service worker registration lives in `ServiceWorkerRegistrar` (production only).
 */
export function ConnectivityBanner() {
  const t = useTranslations('offline');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    // Sync after mount without cascading render from an effect setState burst.
    const frame = window.requestAnimationFrame(() => setOnline(readOnline()));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-pf-connectivity="offline"
      className={cn(
        'border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-2 text-sm text-[var(--pf-text-primary)]',
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>{t('banner.offline')}</p>
        <Link
          href="/settings/offline-drafts"
          className="rounded-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          {t('banner.viewDrafts')}
        </Link>
      </div>
    </div>
  );
}

/** Compact online/offline chip for toolbars. */
export function ConnectivityIndicator({ className }: { className?: string }) {
  const t = useTranslations('offline');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const frame = window.requestAnimationFrame(() => setOnline(readOnline()));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const label = online ? t('indicator.online') : t('indicator.offline');

  return (
    <span
      role="status"
      aria-live="polite"
      data-pf-connectivity={online ? 'online' : 'offline'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
        online
          ? 'text-[var(--pf-text-secondary)]'
          : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          online ? 'bg-[var(--pf-status-success-fg)]' : 'bg-[var(--pf-status-warning-fg)]',
        )}
      />
      <span className="sr-only sm:not-sr-only sm:inline">{label}</span>
    </span>
  );
}
