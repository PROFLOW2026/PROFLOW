import type { Metadata } from 'next';
import { ChevronLeft, ChevronRight, KeyRound } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import type { PortalProjectAccess } from '@/modules/contractor-portal/domain/project-access';
import { projectHomeHref } from '@/modules/contractor-portal/domain/routes';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import {
  portalHubCardClass,
  portalIconTileClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalProjectCardGridClass,
  portalSectionLabelClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { isRtl } from '@/shared/i18n/config';
import { Link } from '@/shared/i18n/navigation';

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
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('nav.projects')}</h1>
        <p className={portalPageSubtitleClass}>{t('hub.projects.subtitle')}</p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('dashboard.noAccess.title')}
          description={t('dashboard.noAccess.description')}
        />
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.organizationId} className="space-y-3">
              <h2 className={portalSectionLabelClass}>
                {portalOrganizationLabel(t, group.projects[0]!.organizationName)}
              </h2>
              <ul className={portalProjectCardGridClass}>
                {group.projects.map((project) => {
                  const vendors = project.vendors
                    .map((vendor) => vendor.vendorName)
                    .filter((name): name is string => Boolean(name));
                  return (
                    <li key={project.projectId}>
                      <Link href={projectHomeHref(project.projectId)} className={portalHubCardClass}>
                        <span className={portalIconTileClass}>
                          <PortalNavIcon navKey="project.home" className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--pf-text-primary)]">
                            {portalProjectLabel(t, project)}
                          </span>
                          {vendors.length > 0 ? (
                            <span className="block truncate text-xs text-[var(--pf-text-secondary)]">
                              {vendors.join(', ')}
                            </span>
                          ) : null}
                        </span>
                        <Chevron
                          className="size-4 shrink-0 text-[var(--pf-text-muted)] transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                          aria-hidden
                        />
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
