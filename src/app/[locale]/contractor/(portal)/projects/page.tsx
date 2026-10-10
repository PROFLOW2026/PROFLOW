import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { projectHomeHref } from '@/modules/contractor-portal/domain/routes';
import type { PortalProjectAccess } from '@/modules/contractor-portal/domain/project-access';
import { employeeHubCardClass, employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isRtl } from '@/shared/i18n/config';
import { getLocale } from 'next-intl/server';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('nav.projects') };
}

function groupProjectsByOrganization(
  projects: readonly PortalProjectAccess[],
): readonly { readonly organizationId: string; readonly projects: readonly PortalProjectAccess[] }[] {
  const groups = new Map<string, PortalProjectAccess[]>();
  for (const project of projects) {
    const list = groups.get(project.organizationId) ?? [];
    list.push(project);
    groups.set(project.organizationId, list);
  }
  return [...groups.entries()].map(([organizationId, groupProjects]) => ({
    organizationId,
    projects: groupProjects,
  }));
}

export default async function ContractorPortalProjectsHubPage() {
  const t = await getTranslations('contractorPortal');
  const locale = await getLocale();
  const Chevron = isRtl(locale) ? ChevronLeft : ChevronRight;
  const { projects } = await loadPortalSession();
  const groups = groupProjectsByOrganization(projects);

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('nav.projects')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('hub.projects.subtitle')}</p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('dashboard.noAccess.title')}
          description={t('dashboard.noAccess.description')}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.organizationId} className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
                {portalOrganizationLabel(t, group.projects[0]!.organizationName)}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.projects.map((project) => {
                  const vendors = project.vendors
                    .map((vendor) => vendor.vendorName)
                    .filter((name): name is string => Boolean(name));
                  return (
                    <li key={project.projectId}>
                      <Link href={projectHomeHref(project.projectId)} className={employeeHubCardClass}>
                        <PortalNavIcon navKey="project.home" className="size-4 shrink-0 text-[var(--pf-accent)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{portalProjectLabel(t, project)}</span>
                          {vendors.length > 0 ? (
                            <span className="block truncate text-xs text-[var(--pf-text-secondary)]">{vendors.join(', ')}</span>
                          ) : null}
                        </span>
                        <Chevron className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
