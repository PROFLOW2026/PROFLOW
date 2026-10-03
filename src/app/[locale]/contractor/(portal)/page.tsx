import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { composePortalSections } from '@/modules/contractor-portal/application/compose-sections';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { PortalProjectList } from '@/modules/contractor-portal/ui/portal-project-list';
import { PortalSectionList } from '@/modules/contractor-portal/ui/portal-sections';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('dashboard.title') };
}

export default async function ContractorPortalDashboardPage() {
  const t = await getTranslations('contractorPortal');
  const { context, projects } = await loadPortalSession();
  const sections = projects.length > 0 ? await composePortalSections(context, projects) : [];

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">
          {context.displayName
            ? t('dashboard.greeting', { name: context.displayName })
            : t('dashboard.title')}
        </h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('dashboard.subtitle')}</p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('dashboard.noAccess.title')}
          description={t('dashboard.noAccess.description')}
        />
      ) : (
        <>
          {sections.length > 0 ? <PortalSectionList sections={sections} projects={projects} /> : null}
          <PortalProjectList projects={projects} />
        </>
      )}

      <PwaInstallCta variant="inline" ctaLabel={t('dashboard.installApp')} className="items-start" />
    </div>
  );
}
