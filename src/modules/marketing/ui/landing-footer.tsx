import { getTranslations } from 'next-intl/server';
import { LegalFooterLinks } from '@/modules/legal/ui/legal-footer-links';
import { Link } from '@/shared/i18n/navigation';

export async function LandingFooter() {
  const t = await getTranslations('marketing.footer');

  const anchorLinks = [
    { href: '#how-it-works', label: t('links.howItWorks') },
    { href: '#capabilities', label: t('links.capabilities') },
    { href: '#faq', label: t('links.faq') },
  ] as const;

  const routeLinks = [
    { href: '/sign-in', label: t('links.signIn') },
    { href: '/employee/login', label: t('links.employeeLogin') },
  ] as const;

  return (
    <footer
      className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] py-8"
      data-pf-landing-footer
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--pf-text-primary)]" dir="ltr">
              {t('note')}
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--pf-text-secondary)]">
              {t('tagline')}
            </p>
            <p className="mt-2 text-xs text-[var(--pf-text-muted)]">{t('languages')}</p>
          </div>
          <nav
            className="flex min-w-0 flex-wrap gap-x-4 gap-y-2"
            aria-label={t('navLabel')}
          >
            {anchorLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-[var(--pf-text-secondary)] no-underline hover:text-[var(--pf-text-brand)]"
              >
                {item.label}
              </a>
            ))}
            {routeLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-[var(--pf-text-secondary)] no-underline hover:text-[var(--pf-text-brand)]"
              >
                {item.label}
              </Link>
            ))}
            <LegalFooterLinks className="text-sm font-medium text-[var(--pf-text-secondary)] [&_a]:text-[var(--pf-text-secondary)] [&_a:hover]:text-[var(--pf-text-brand)]" />
          </nav>
        </div>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('bookkeepingNote')}</p>
      </div>
    </footer>
  );
}
