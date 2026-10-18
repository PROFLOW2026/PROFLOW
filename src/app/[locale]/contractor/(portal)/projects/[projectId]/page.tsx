import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { composePortalSections } from '@/modules/contractor-portal/application/compose-sections';
import { loadPortalProject } from '@/modules/contractor-portal/application/load-portal-session';
import { buildPortalProjectNav } from '@/modules/contractor-portal/domain/nav';
import type { ComposedPortalSection } from '@/modules/contractor-portal/domain/sections';
import { portalOrganizationLabel, portalProjectLabel } from '@/modules/contractor-portal/ui/labels';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import { PortalSectionList } from '@/modules/contractor-portal/ui/portal-sections';
import { employeeHubCardClass, employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

const FILE_LINK_KEYS = new Set(['project.plans', 'project.documents']);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  const { project } = await loadPortalProject(projectId);
  return { title: project ? portalProjectLabel(t, project) : t('project.title') };
}

function sectionForLink(sections: readonly ComposedPortalSection[], key: string): ComposedPortalSection | undefined {
  if (key === 'project.plans') return sections.find((section) => section.id === 'planRevisions');
  if (key === 'project.documents') return sections.find((section) => section.id === 'documents');
  return undefined;
}

export default async function ContractorPortalProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('contractorPortal');
  const { session, project } = await loadPortalProject(projectId);
  if (!project) notFound();

  const allSections = await composePortalSections(session.context, [project]);
  const attention = allSections.filter((section) => section.attentionCount > 0);
  const fileLinks = buildPortalProjectNav(project.projectId, project.capabilities).filter((item) =>
    FILE_LINK_KEYS.has(item.key),
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

      {fileLinks.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2">
          {fileLinks.map((item) => {
            const section = sectionForLink(allSections, item.key);
            const count = section?.count ?? 0;
            return (
              <li key={item.key}>
                <Link href={item.href} className={employeeHubCardClass}>
                  <span className="flex min-w-0 items-center gap-2">
                    <PortalNavIcon navKey={item.key} className="size-4 shrink-0 text-[var(--pf-accent)]" />
                    <span className="truncate text-sm font-medium">{t(item.labelKey)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {attention.length > 0 ? (
        <PortalSectionList sections={attention} projects={[project]} projectId={project.projectId} />
      ) : null}

      {fileLinks.length === 0 && attention.length === 0 ? (
        <EmptyState icon={KeyRound} title={t('sections.today.empty')} description={t('project.nothingShared')} />
      ) : null}
    </div>
  );
}
