'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

/**
 * Compact chrome link (bottom nav / portal tabs) with immediate pending feedback
 * while a soft navigation is in flight.
 */
export function PendingChromeLink({
  href,
  active,
  className,
  children,
  icon,
}: {
  readonly href: string;
  readonly active: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly icon?: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations('common');
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [seenPathname, setSeenPathname] = React.useState(pathname);

  if (pathname !== seenPathname) {
    setSeenPathname(pathname);
    if (pendingHref !== null) setPendingHref(null);
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
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      aria-busy={busy || undefined}
      data-pending={busy ? '' : undefined}
      onClick={(event) => {
        if (active) return;
        if (busy) {
          event.preventDefault();
          return;
        }
        setPendingHref(href);
      }}
      className={cn(pressableChromeClassName, busy && 'pointer-events-none opacity-90', className)}
    >
      <PendingChromeLinkBody forcePending={busy} pendingLabel={t('a11y.navigating')} icon={icon}>
        {children}
      </PendingChromeLinkBody>
    </Link>
  );
}

function PendingChromeLinkBody({
  forcePending,
  pendingLabel,
  icon,
  children,
}: {
  forcePending: boolean;
  pendingLabel: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { pending: linkPending } = useLinkStatus();
  const pending = forcePending || linkPending;

  return (
    <>
      {icon ? (
        <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
          <span className={cn(pending && 'opacity-0')}>{icon}</span>
          <Loader2
            className={cn(
              'absolute inset-0 m-auto size-5 animate-spin text-current',
              pending ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden
          />
        </span>
      ) : null}
      {children}
      {pending ? <span className="sr-only">{pendingLabel}</span> : null}
    </>
  );
}
