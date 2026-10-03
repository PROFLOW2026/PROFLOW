import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { isRtl } from '@/shared/i18n/config';
import { employeeHubCardClass } from '@/modules/employee-app/ui/employee-surface-styles';
import type { PortalProjectAccess } from '../domain/project-access';
import { projectHomeHref } from '../domain/routes';
import { portalOrganizationLabel, portalProjectLabel } from './labels';

export async function PortalProjectList({ projects }: { projects: readonly PortalProjectAccess[] }) {
  const t = await getTranslations('contractorPortal');
  const Chevron = isRtl(await getLocale()) ? ChevronLeft : ChevronRight;

  return (
    <section aria-labelledby="pf-portal-projects" className="space-y-2">
      <h2 id="pf-portal-projects" className="text-sm font-semibold">
        {t('dashboard.projectsTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {projects.map((project) => {
          const vendors = project.vendors
            .map((vendor) => vendor.vendorName)
            .filter((name): name is string => Boolean(name));
          return (
            <li key={project.projectId}>
              <Link href={projectHomeHref(project.projectId)} className={employeeHubCardClass}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{portalProjectLabel(t, project)}</span>
                  <span className="block truncate text-xs text-[var(--pf-text-secondary)]">
                    {portalOrganizationLabel(t, project.organizationName)}
                    {vendors.length > 0 ? ` · ${vendors.join(', ')}` : ''}
                  </span>
                </span>
                <Chevron className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
