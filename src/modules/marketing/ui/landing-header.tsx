'use client';

import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const NAV = [
  { href: '#how-it-works', key: 'howItWorks' as const },
  { href: '#product-tour', key: 'capabilities' as const },
  { href: '#faq', key: 'faq' as const },
];

export function LandingHeader() {
  const t = useTranslations('marketing.header');
  const tCommon = useTranslations('common');
  const [open, setOpen] = React.useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--pf-border-default)] bg-[color-mix(in_srgb,var(--pf-bg-surface)_92%,transparent)] backdrop-blur-md"
      data-pf-landing-header
    >
      <div className="mx-auto flex h-16 w-full min-w-0 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex min-w-0 items-center gap-2 text-[var(--pf-text-primary)] no-underline"
          aria-label={tCommon('appName')}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pf-action-primary)] text-xs font-bold text-[var(--pf-action-primary-fg)]"
            aria-hidden
          />
          <span className="truncate text-lg font-bold tracking-tight" dir="ltr">
            {tCommon('appName')}
          </span>
        </Link>

        <nav className="hidden items-center gap-5 md:flex" aria-label={t('navLabel')}>
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[var(--pf-text-secondary)] no-underline hover:text-[var(--pf-text-brand)]"
            >
              {t(item.key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <PwaInstallCta variant="marketing" className="max-w-none [&_button]:min-h-11" />
          </div>
          <Button asChild variant="primary" size="sm" className="min-h-11">
            <Link href="/sign-in">{t('signIn')}</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            aria-label={open ? t('closeMenu') : t('openMenu')}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      <div
        id="landing-mobile-nav"
        className={cn(
          'border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 md:hidden',
          open ? 'block' : 'hidden',
        )}
      >
        <nav className="flex flex-col gap-1" aria-label={t('navLabel')}>
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-[var(--pf-text-primary)] no-underline hover:bg-[var(--pf-action-subtle-hover)]"
              onClick={() => setOpen(false)}
            >
              {t(item.key)}
            </a>
          ))}
        </nav>
        <div className="mt-3 sm:hidden">
          <PwaInstallCta variant="marketing" />
        </div>
      </div>
    </header>
  );
}
