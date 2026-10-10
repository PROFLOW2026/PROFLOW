import type { Metadata } from 'next';
import { Bell, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { loadPortalSession, loadPortalShellData } from '@/modules/contractor-portal/application/load-portal-session';
import { buildPortalProjectNav } from '@/modules/contractor-portal/domain/nav';
import { buildPortalHref } from '@/modules/contractor-portal/domain/routes';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import { employeeHubCardClass, employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
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
  const { projects } = session;

  const docBlocks = projects
    .map((project) => {
      const links = buildPortalProjectNav(project.projectId, project.capabilities).filter(
        (item) => item.key === 'project.documents' || item.key === 'project.plans',
      );
      return { project, links };
    })
    .filter((block) => block.links.length > 0);

  const accountHref = buildPortalHref('account');
  const notificationsHref = buildPortalHref('notifications');

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('nav.more')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('hub.more.subtitle')}</p>
      </header>

      <section className="space-y-2" aria-labelledby="pf-portal-more-account">
        <h2 id="pf-portal-more-account" className="text-sm font-semibold">
          {t('hub.more.accountSection')}
        </h2>
        <ul className="flex flex-col gap-2">
          <li>
            <Link href={accountHref} className={employeeHubCardClass}>
              <UserRound className="size-4 shrink-0 text-[var(--pf-accent)]" aria-hidden />
              <span className="text-sm font-medium">{t('nav.account')}</span>
            </Link>
          </li>
          <li>
            <Link href={notificationsHref} className={employeeHubCardClass}>
              <Bell className="size-4 shrink-0 text-[var(--pf-accent)]" aria-hidden />
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
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

      {docBlocks.length > 0 ? (
        <div className="flex flex-col gap-6">
          {docBlocks.map(({ project, links }) => (
            <section key={project.projectId} className="space-y-2">
              <h2 className="text-sm font-semibold">
                {portalProjectLabel(t, project)}
                <span className="font-normal text-[var(--pf-text-secondary)]">
                  {' · '}
                  {portalOrganizationLabel(t, project.organizationName)}
                </span>
              </h2>
              <ul className="grid grid-cols-2 gap-2">
                {links.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={employeeHubCardClass}>
                      <PortalNavIcon navKey={item.key} className="size-4 shrink-0 text-[var(--pf-accent)]" />
                      <span className="truncate text-sm font-medium">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      <section className="space-y-2" aria-labelledby="pf-portal-more-connect-org">
        <h2 id="pf-portal-more-connect-org" className="text-sm font-semibold">
          {t('hub.more.connectOrgTitle')}
        </h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('hub.more.connectOrgDescription')}</p>
        <Link href="/projects/connect-developer" className={employeeHubCardClass}>
          <span className="text-sm font-medium">{t('hub.more.connectOrgCta')}</span>
        </Link>
      </section>

      <PwaInstallCta variant="inline" ctaLabel={t('dashboard.installApp')} className="items-start" />
    </div>
  );
}
