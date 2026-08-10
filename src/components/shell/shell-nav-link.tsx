'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { NavIcon } from './nav-icon';
import type { NavIconKey } from './navigation';

export interface ShellNavLinkProps {
  href: string;
  label: string;
  iconKey: NavIconKey;
  active: boolean;
  variant: 'sidebar' | 'mobile';
  onNavigate?: () => void;
  className?: string;
  /** Soften the icon color (overflow sheet idle rows). */
  muteIcon?: boolean;
  /**
   * Next.js Link prefetch. Default false — shell destinations must not
   * storm RSC on dashboard mount. Opt in only for high-probability next hops.
   */
  prefetch?: boolean;
}

/**
 * Main-nav link with same-interaction pending feedback.
 *
 * Local click state gives an immediate pressed look and blocks duplicate clicks
 * to the same href. Next.js `useLinkStatus` covers the brief pre-history window.
 * Route `loading.tsx` files handle the rest of the transition.
 */
export function ShellNavLink({
  href,
  label,
  iconKey,
  active,
  variant,
  onNavigate,
  className,
  muteIcon = false,
  prefetch = false,
}: ShellNavLinkProps) {
  const pathname = usePathname();
  const t = useTranslations('common');
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [seenPathname, setSeenPathname] = React.useState(pathname);

  if (pathname !== seenPathname) {
    setSeenPathname(pathname);
    if (pendingHref !== null) {
      setPendingHref(null);
    }
  }

  // Soft-nav can fail without a pathname change; clear stuck busy chrome.
  React.useEffect(() => {
    if (pendingHref === null) return;
    const timer = window.setTimeout(() => setPendingHref(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  // Pending until navigation completes (or pathname changes via another path).
  const busy = !active && pendingHref === href;

  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-current={active ? 'page' : undefined}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      data-pending={busy ? '' : undefined}
      onClick={(event) => {
        if (active) {
          onNavigate?.();
          return;
        }
        if (busy) {
          event.preventDefault();
          return;
        }
        setPendingHref(href);
        onNavigate?.();
      }}
      className={cn(
        pressableChromeClassName,
        variant === 'sidebar'
          ? cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
              active || busy
                ? 'bg-[var(--pf-teal-50)] text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)] active:bg-[var(--pf-action-subtle-active)] active:text-[var(--pf-text-primary)]',
            )
          : cn(
              'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
              active || busy
                ? 'text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)] active:text-[var(--pf-text-primary)]',
            ),
        busy && 'pointer-events-none opacity-90',
        className,
      )}
    >
      <ShellNavLinkBody
        label={label}
        iconKey={iconKey}
        variant={variant}
        forcePending={busy}
        pendingLabel={t('a11y.navigating')}
        muteIcon={muteIcon && !active && !busy}
      />
    </Link>
  );
}

function ShellNavLinkBody({
  label,
  iconKey,
  variant,
  forcePending,
  pendingLabel,
  muteIcon,
}: {
  label: string;
  iconKey: NavIconKey;
  variant: 'sidebar' | 'mobile';
  forcePending: boolean;
  pendingLabel: string;
  muteIcon: boolean;
}) {
  const { pending: linkPending } = useLinkStatus();
  const pending = forcePending || linkPending;
  const iconClass = variant === 'sidebar' ? 'size-4.5 shrink-0' : 'size-5 shrink-0';
  const slotClass = variant === 'sidebar' ? 'size-4.5' : 'size-5';

  return (
    <>
      <span className={cn('relative inline-flex shrink-0 items-center justify-center', slotClass)}>
        <NavIcon
          iconKey={iconKey}
          className={cn(iconClass, pending && 'opacity-0', muteIcon && 'text-[var(--pf-text-muted)]')}
        />
        <Loader2
          className={cn(
            'absolute inset-0 m-auto animate-spin text-current',
            iconClass,
            pending ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden
        />
      </span>
      <span className={cn('truncate', variant === 'mobile' && 'max-w-full')}>{label}</span>
      {pending ? <span className="sr-only">{pendingLabel}</span> : null}
    </>
  );
}
