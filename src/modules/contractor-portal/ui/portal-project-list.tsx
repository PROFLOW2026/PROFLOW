import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { isRtl } from '@/shared/i18n/config';
import type { PortalProjectAccess } from '../domain/project-access';
import { projectHomeHref } from '../domain/routes';
import { portalOrganizationLabel, portalProjectLabel } from './labels';
import { PortalNavIcon } from './portal-nav-icon';
import {
  portalHubCardClass,
  portalIconTileClass,
  portalPageSubtitleClass,
  portalProjectCardGridClass,
} from './portal-surface';

export async function PortalProjectList({ projects }: { projects: readonly PortalProjectAccess[] }) {
  const t = await getTranslations('contractorPortal');
  const Chevron = isRtl(await getLocale()) ? ChevronLeft : ChevronRight;

  return (
    <section aria-labelledby="pf-portal-projects" className="space-y-3">
      <div className="space-y-1">
        <h2 id="pf-portal-projects" className="text-base font-semibold tracking-tight text-[var(--pf-text-primary)]">
          {t('dashboard.projectsTitle')}
        </h2>
        <p className={portalPageSubtitleClass}>{t('hub.projects.subtitle')}</p>
      </div>
      <ul className={portalProjectCardGridClass}>
        {projects.map((project) => {
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
                  <span className="block truncate text-xs text-[var(--pf-text-secondary)]">
                    {portalOrganizationLabel(t, project.organizationName)}
                    {vendors.length > 0 ? ` · ${vendors.join(', ')}` : ''}
                  </span>
                </span>
                <Chevron className="size-4 shrink-0 text-[var(--pf-text-muted)] transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
