import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { composePortalSections } from '@/modules/contractor-portal/application/compose-sections';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { buildPortalProjectNav } from '@/modules/contractor-portal/domain/nav';
import { isContractorFinanceRouteKey } from '@/modules/contractor-portal/domain/mobile-tabs';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import { PortalSectionList } from '@/modules/contractor-portal/ui/portal-sections';
import { employeeHubCardClass, employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('nav.finance') };
}

export default async function ContractorPortalFinanceHubPage() {
  const t = await getTranslations('contractorPortal');
  const { context, projects } = await loadPortalSession();
  const allSections = projects.length > 0 ? await composePortalSections(context, projects) : [];
  const cashFlowSections = allSections.filter((section) => section.id === 'cashFlowForecast');

  const projectBlocks = projects
    .map((project) => {
      const links = buildPortalProjectNav(project.projectId, project.capabilities).filter(
        (item) =>
          item.key !== 'project.contract' &&
          item.key !== 'project.contractChanges' &&
          isContractorFinanceRouteKey(item.key),
      );
      return { project, links };
    })
    .filter((block) => block.links.length > 0);

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('nav.finance')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('hub.finance.subtitle')}</p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('dashboard.noAccess.title')}
          description={t('dashboard.noAccess.description')}
        />
      ) : (
        <>
          {cashFlowSections.length > 0 ? (
            <PortalSectionList sections={cashFlowSections} projects={projects} />
          ) : null}

          {projectBlocks.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('hub.finance.empty')}</p>
          ) : (
            <div className="flex flex-col gap-6">
              {projectBlocks.map(({ project, links }) => (
                <section key={project.projectId} className="space-y-2">
                  <h2 className="text-sm font-semibold">
                    {portalProjectLabel(t, project)}
                    <span className="font-normal text-[var(--pf-text-secondary)]">
                      {' · '}
                      {portalOrganizationLabel(t, project.organizationName)}
                    </span>
                  </h2>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          )}
        </>
      )}
    </div>
  );
}
