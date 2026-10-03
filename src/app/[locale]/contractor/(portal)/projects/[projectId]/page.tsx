import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { composePortalSections } from '@/modules/contractor-portal/application/compose-sections';
import { loadPortalProject } from '@/modules/contractor-portal/application/load-portal-session';
import { buildPortalProjectNav } from '@/modules/contractor-portal/domain/nav';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import { PortalSectionList } from '@/modules/contractor-portal/ui/portal-sections';
import { employeeHubCardClass, employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  const { project } = await loadPortalProject(projectId);
  return { title: project ? portalProjectLabel(t, project) : t('project.title') };
}

export default async function ContractorPortalProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('contractorPortal');
  const { session, project } = await loadPortalProject(projectId);
  if (!project) notFound();

  const sections = await composePortalSections(session.context, [project]);
  const links = buildPortalProjectNav(project.projectId, project.capabilities).filter(
    (item) => item.key !== 'project.home',
  );
  const vendors = project.vendors
    .map((vendor) => vendor.vendorName)
    .filter((name): name is string => Boolean(name));

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-[var(--pf-text-primary)]">{portalProjectLabel(t, project)}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {portalOrganizationLabel(t, project.organizationName)}
          {vendors.length > 0 ? ` · ${t('project.workingAs', { vendor: vendors.join(', ') })}` : ''}
        </p>
      </header>

      {links.length > 0 ? (
        <nav aria-label={t('project.linksLabel')}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {links.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className={employeeHubCardClass}>
                  <span className="flex min-w-0 items-center gap-2">
                    <PortalNavIcon navKey={item.key} className="size-4 shrink-0 text-[var(--pf-accent)]" />
                    <span className="truncate text-sm font-medium">{t(item.labelKey)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {sections.length > 0 ? (
        <PortalSectionList sections={sections} projects={[project]} projectId={project.projectId} />
      ) : null}

      {links.length === 0 && sections.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('project.nothingShared')}</p>
      ) : null}
    </div>
  );
}
