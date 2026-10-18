import type { Metadata } from 'next';
import { Bell, Building2, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { loadPortalSession, loadPortalShellData } from '@/modules/contractor-portal/application/load-portal-session';
import { buildPortalHref } from '@/modules/contractor-portal/domain/routes';
import {
  portalHubCardClass,
  portalIconTileClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalPanelClass,
  portalSectionLabelClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('nav.more') };
}

export default async function ContractorPortalMoreHubPage() {
  const t = await getTranslations('contractorPortal');
  const session = await loadPortalSession();
  const shell = await loadPortalShellData(session);

  const accountHref = buildPortalHref('account');
  const notificationsHref = buildPortalHref('notifications');

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('nav.more')}</h1>
        <p className={portalPageSubtitleClass}>{t('hub.more.subtitle')}</p>
      </header>

      <section className={portalPanelClass} aria-labelledby="pf-portal-more-account">
        <h2 id="pf-portal-more-account" className={portalSectionLabelClass}>
          {t('hub.more.accountSection')}
        </h2>
        <ul className="mt-3 flex flex-col gap-2.5">
          <li>
            <Link href={accountHref} className={portalHubCardClass}>
              <span className={portalIconTileClass}>
                <UserRound className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-medium text-[var(--pf-text-primary)]">{t('nav.account')}</span>
            </Link>
          </li>
          <li>
            <Link href={notificationsHref} className={portalHubCardClass}>
              <span className={portalIconTileClass}>
                <Bell className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-[var(--pf-text-primary)]">
                {t('nav.notifications')}
                {shell.unreadNotifications != null && shell.unreadNotifications > 0 ? (
                  <span className="rounded-full bg-[var(--pf-action-danger)] px-2 py-0.5 text-xs font-semibold text-[var(--pf-text-inverse)]">
                    {shell.unreadNotifications > 99 ? '99+' : shell.unreadNotifications}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section className={portalPanelClass} aria-labelledby="pf-portal-more-connect-org">
        <div className="mb-3 flex items-start gap-3">
          <span className={portalIconTileClass}>
            <Building2 className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 id="pf-portal-more-connect-org" className="text-base font-semibold tracking-tight text-[var(--pf-text-primary)]">
              {t('hub.more.connectOrgTitle')}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--pf-text-secondary)]">
              {t('hub.more.connectOrgDescription')}
            </p>
          </div>
        </div>
        <Link
          href={`/sign-in?next=${encodeURIComponent('/projects/connect-developer')}`}
          className={portalHubCardClass}
        >
          <span className="text-sm font-semibold text-[var(--pf-accent)]">{t('hub.more.connectOrgCta')}</span>
        </Link>
      </section>

      <PwaInstallCta variant="inline" ctaLabel={t('dashboard.installApp')} className="items-start" />
    </div>
  );
}
