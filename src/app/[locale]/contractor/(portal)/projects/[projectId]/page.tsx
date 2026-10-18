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
import {
  portalHeroClass,
  portalModuleGridClass,
  portalModuleTileClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalSectionLabelClass,
} from '@/modules/contractor-portal/ui/portal-surface';
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
    <div className={portalPageStackClass}>
      <header className={portalHeroClass}>
        <p className={portalSectionLabelClass}>{portalOrganizationLabel(t, project.organizationName)}</p>
        <h1 className={portalPageTitleClass}>{portalProjectLabel(t, project)}</h1>
        {vendors.length > 0 ? (
          <p className={portalPageSubtitleClass}>{t('project.workingAs', { vendor: vendors.join(', ') })}</p>
        ) : null}
      </header>

      {fileLinks.length > 0 ? (
        <section className="space-y-3" aria-labelledby="pf-portal-project-files">
          <h2 id="pf-portal-project-files" className={portalSectionLabelClass}>
            {t('project.linksLabel')}
          </h2>
          <ul className={portalModuleGridClass}>
            {fileLinks.map((item) => {
              const section = sectionForLink(allSections, item.key);
              const count = section?.count ?? 0;
              return (
                <li key={item.key}>
                  <Link href={item.href} className={portalModuleTileClass}>
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pf-teal-50)] text-[var(--pf-accent)] ring-1 ring-[var(--pf-teal-100)]">
                        <PortalNavIcon navKey={item.key} className="size-4" />
                      </span>
                      <span className="truncate text-sm font-semibold text-[var(--pf-text-primary)]">
                        {t(item.labelKey)}
                      </span>
                    </span>
                    <span className="self-end rounded-lg bg-[var(--pf-bg-muted)] px-2.5 py-1 text-sm font-semibold tabular-nums text-[var(--pf-text-primary)]">
                      {count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
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
