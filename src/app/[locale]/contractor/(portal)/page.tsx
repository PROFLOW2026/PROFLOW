import type { Metadata } from 'next';
import { ChevronRight, KeyRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { composePortalSections } from '@/modules/contractor-portal/application/compose-sections';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { PORTAL_TODAY_SECTION_IDS } from '@/modules/contractor-portal/domain/mobile-tabs';
import { buildPortalHref } from '@/modules/contractor-portal/domain/routes';
import { PortalNavIcon } from '@/modules/contractor-portal/ui/portal-nav-icon';
import { PortalSectionList } from '@/modules/contractor-portal/ui/portal-sections';
import {
  portalHeroClass,
  portalHubCardClass,
  portalIconTileClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { Link } from '@/shared/i18n/navigation';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';

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
  const { context, projects } = await loadPortalSession();
  const allSections = projects.length > 0 ? await composePortalSections(context, projects) : [];
  const sections = allSections.filter((section) => TODAY_SECTIONS.has(section.id));
  const attentionTotal = allSections.reduce((sum, section) => sum + section.attentionCount, 0);

  return (
    <div className={portalPageStackClass}>
      <header className={portalHeroClass}>
        <div className="relative max-w-2xl">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--pf-teal-800)]">
            {t('nav.today')}
          </p>
          <h1 className={portalPageTitleClass}>
            {context.displayName ? t('dashboard.greeting', { name: context.displayName }) : t('nav.today')}
          </h1>
          <p className={portalPageSubtitleClass}>{t('dashboard.subtitle')}</p>
        </div>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t('dashboard.noAccess.title')}
          description={t('dashboard.noAccess.description')}
        />
      ) : (
        <>
          {sections.length > 0 ? (
            <PortalSectionList sections={sections} projects={projects} />
          ) : (
            <EmptyState icon={KeyRound} title={t('sections.today.empty')} description={t('dashboard.subtitle')} />
          )}
          <Link href={buildPortalHref('projects')} className={portalHubCardClass}>
            <span className={portalIconTileClass}>
              <PortalNavIcon navKey="projects" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--pf-text-primary)]">{t('nav.projects')}</span>
              <span className="block text-xs text-[var(--pf-text-secondary)]">
                {t('dashboard.projectsShortcutHint', { count: projects.length })}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-lg bg-[var(--pf-bg-muted)] px-2.5 py-1 text-sm font-semibold tabular-nums">
                {projects.length}
              </span>
              {attentionTotal > 0 ? (
                <StatusBadge shape="overdue" label={t('sections.attention', { count: attentionTotal })} />
              ) : null}
              <ChevronRight className={rtlFlipClassName('size-4 shrink-0 text-[var(--pf-text-muted)]')} aria-hidden />
            </span>
          </Link>
        </>
      )}
    </div>
  );
}
