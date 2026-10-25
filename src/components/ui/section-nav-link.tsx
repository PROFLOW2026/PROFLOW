'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { pressableClassName, textNavLinkClassName as textNavLinkClassNameBase } from '@/components/ui/pressable';
import { sectionNavTargetSettled } from '@/components/ui/section-nav-target';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { preserveScrollOnQueryNav } from '@/shared/i18n/soft-navigation';
import { cn } from '@/shared/ui/cn';

/**
 * Shared styles for in-app section / workspace pill tabs (procurement, assets, …).
 * Idle · hover · active(touch) · focus · current · pending.
 */
export const sectionNavLinkClassName = cn(
  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
  pressableClassName,
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
  'text-[var(--pf-text-secondary)]',
  'hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
  // Touch press - not hover-only.
  'active:bg-[var(--pf-action-subtle-active)] active:text-[var(--pf-text-primary)]',
  'aria-[current=page]:bg-[var(--pf-accent-soft)] aria-[current=page]:text-[var(--pf-text-brand)]',
  'aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-90',
  'data-[pending]:pointer-events-none',
);

/** Re-export - prefer importing from `@/components/ui/pressable` in Server Components. */
export const textNavLinkClassName = textNavLinkClassNameBase;

export interface SectionNavLinkProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  onNavigate?: () => void;
  /**
   * Next.js Link prefetch. Default false - settings/section nav must not
   * prefetch every sibling route on mount.
   */
  prefetch?: boolean;
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
  prefetch = false,
}: SectionNavLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const t = useTranslations('common');
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [seenLocation, setSeenLocation] = React.useState(`${pathname}?${search}`);
  const settled = sectionNavTargetSettled(pathname, search, href);
  const location = `${pathname}?${search}`;

  if (location !== seenLocation) {
    setSeenLocation(location);
    if (pendingHref !== null) {
      setPendingHref(null);
    }
  }

  React.useEffect(() => {
    if (pendingHref === null) return;
    const timer = window.setTimeout(() => setPendingHref(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  const busy = !settled && !active && pendingHref === href;

  return (
    <Link
      href={href}
      prefetch={prefetch}
      scroll={preserveScrollOnQueryNav.scroll}
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
      <SectionNavLinkBody
        forcePending={busy}
        settled={settled}
        pendingLabel={t('a11y.navigating')}
      >
        {children}
      </SectionNavLinkBody>
    </Link>
  );
}

function SectionNavLinkBody({
  children,
  forcePending,
  settled,
  pendingLabel,
}: {
  children: React.ReactNode;
  forcePending: boolean;
  settled: boolean;
  pendingLabel: string;
}) {
  const { pending: linkPending } = useLinkStatus();
  const pending = !settled && (forcePending || linkPending);

  return (
    <>
      {children}
      {pending ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin text-current" aria-hidden />
          <span className="sr-only">{pendingLabel}</span>
        </>
      ) : null}
    </>
  );
}
