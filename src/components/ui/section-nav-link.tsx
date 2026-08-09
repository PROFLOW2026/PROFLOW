'use client';

import { useLinkStatus } from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

/**
 * Shared styles for in-app section / workspace pill tabs (procurement, assets, …).
 * Idle · hover · active(touch) · focus · current · pending.
 */
export const sectionNavLinkClassName = cn(
  'inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm font-medium',
  'transition-[color,background-color,opacity] duration-[var(--pf-motion-fast)] ease-[var(--pf-easing)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
  'text-[var(--pf-text-secondary)]',
  'hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
  // Touch press — not hover-only.
  'active:bg-[var(--pf-action-subtle-active)] active:text-[var(--pf-text-primary)]',
  'aria-[current=page]:bg-[var(--pf-teal-50)] aria-[current=page]:text-[var(--pf-text-brand)]',
  'aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-90',
  'data-[pending]:pointer-events-none',
);

/** Inline text links used for entity / back navigation (not shell chrome). */
export const textNavLinkClassName = cn(
  'text-[var(--pf-text-brand)] underline-offset-4',
  'transition-[color,opacity] duration-[var(--pf-motion-fast)] ease-[var(--pf-easing)]',
  'hover:underline active:underline active:opacity-80',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
  'aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-90',
);

export interface SectionNavLinkProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  onNavigate?: () => void;
}

/**
 * Locale-aware section tab link with immediate pending feedback.
 * Prefer this over ad-hoc `Link` + hover-only classes for workspace section nav.
 * Shell main-nav stays on `ShellNavLink` (icons + bottom bar).
 */
export function SectionNavLink({
  href,
  children,
  active = false,
  className,
  onNavigate,
}: SectionNavLinkProps) {
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

  React.useEffect(() => {
    if (pendingHref === null) return;
    const timer = window.setTimeout(() => setPendingHref(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  const busy = !active && pendingHref === href;

  return (
    <Link
      href={href}
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
      className={cn(sectionNavLinkClassName, className)}
    >
      <SectionNavLinkBody forcePending={busy} pendingLabel={t('a11y.navigating')}>
        {children}
      </SectionNavLinkBody>
    </Link>
  );
}

function SectionNavLinkBody({
  children,
  forcePending,
  pendingLabel,
}: {
  children: React.ReactNode;
  forcePending: boolean;
  pendingLabel: string;
}) {
  const { pending: linkPending } = useLinkStatus();
  const pending = forcePending || linkPending;

  return (
    <>
      {children}
      {pending ? <span className="sr-only">{pendingLabel}</span> : null}
    </>
  );
}
