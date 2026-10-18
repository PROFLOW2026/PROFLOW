import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { isContractorWorkRouteKey } from '@/modules/contractor-portal/domain/mobile-tabs';
import { buildPortalProjectNav } from '@/modules/contractor-portal/domain/nav';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import {
  portalModuleGridClass,
  portalModuleTileClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalPanelClass,
  portalSectionLabelClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('nav.work') };
}

export default async function ContractorPortalWorkHubPage() {
  const t = await getTranslations('contractorPortal');
  const { projects } = await loadPortalSession();

  const projectBlocks = projects
    .map((project) => {
      const links = buildPortalProjectNav(project.projectId, project.capabilities).filter((item) =>
        isContractorWorkRouteKey(item.key),
      );
      return { project, links };
    })
    .filter((block) => block.links.length > 0);

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('nav.work')}</h1>
        <p className={portalPageSubtitleClass}>{t('hub.work.subtitle')}</p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('dashboard.noAccess.title')}
          description={t('dashboard.noAccess.description')}
        />
      ) : projectBlocks.length === 0 ? (
        <EmptyState icon={KeyRound} title={t('hub.work.empty')} description={t('hub.work.subtitle')} />
      ) : (
        <div className="flex flex-col gap-5">
          {projectBlocks.map(({ project, links }) => (
            <section key={project.projectId} className={portalPanelClass}>
              <div className="mb-3 space-y-1">
                <h2 className="text-base font-semibold tracking-tight text-[var(--pf-text-primary)]">
                  {portalProjectLabel(t, project)}
                </h2>
                <p className={portalSectionLabelClass}>
                  {portalOrganizationLabel(t, project.organizationName)}
                </p>
              </div>
              <ul className={portalModuleGridClass}>
                {links.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={portalModuleTileClass}>
                      <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pf-teal-50)] text-[var(--pf-accent)] ring-1 ring-[var(--pf-teal-100)]">
                        <PortalNavIcon navKey={item.key} className="size-4" />
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--pf-text-primary)]">
                        {t(item.labelKey)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
