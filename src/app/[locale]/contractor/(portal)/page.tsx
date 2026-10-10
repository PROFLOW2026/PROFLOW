import type { Metadata } from 'next';
import { KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { composePortalSections } from '@/modules/contractor-portal/application/compose-sections';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { PORTAL_TODAY_SECTION_IDS } from '@/modules/contractor-portal/domain/mobile-tabs';
import { PortalSectionList } from '@/modules/contractor-portal/ui/portal-sections';
import { employeeHubCardClass, employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale } from 'next-intl/server';
import { isRtl } from '@/shared/i18n/config';
import { buildPortalHref } from '@/modules/contractor-portal/domain/routes';

const TODAY_SECTIONS = new Set<string>(PORTAL_TODAY_SECTION_IDS);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('nav.today') };
}

export default async function ContractorPortalDashboardPage() {
  const t = await getTranslations('contractorPortal');
  const locale = await getLocale();
  const Chevron = isRtl(locale) ? ChevronLeft : ChevronRight;
  const { context, projects } = await loadPortalSession();
  const allSections = projects.length > 0 ? await composePortalSections(context, projects) : [];
  const sections = allSections.filter((section) => TODAY_SECTIONS.has(section.id));

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">
          {context.displayName ? t('dashboard.greeting', { name: context.displayName }) : t('nav.today')}
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
          <Link href={buildPortalHref('projects')} className={employeeHubCardClass}>
            <span className="min-w-0 flex-1 text-sm font-semibold">{t('nav.projects')}</span>
            <Chevron className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
          </Link>
        </>
      )}
    </div>
  );
}
