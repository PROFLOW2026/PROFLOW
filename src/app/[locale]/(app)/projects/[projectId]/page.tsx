import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { titleWithDocumentNumber } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { getModuleVisibility } from '@/modules/tenancy';
import { loadProjectDetail } from './load-project-detail';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { ProjectDetailsWorkspace } from './project-details-workspace';
import { ProjectWorkWorkspace } from './project-work-workspace';
import { type ProjectTabKey } from './project-tabs-shell';
import { DEFAULT_PROJECT_TAB, resolveHubFromTabParam } from './project-hub-order';
import { resolveProjectFilesTabVisible } from './project-tab-order';
import {
  hubSectionsForDisplay,
  resolveProjectTabVisibility,
} from './resolve-project-tab-visibility';
import { resolveProjectExperienceProfile } from '@/modules/tenancy';
import { getShellContextForProject } from '@/shared/auth/session';
import { localeDirection } from '@/shared/i18n/config';
import { ProjectHubSectionNav } from './project-hub-section-nav';
import { readExperienceShowHiddenProjectTabsCookie } from '@/modules/tenancy/application/experience-project-tabs-preference';

interface ProjectPageProps {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    contractId?: string | string[];
    cycleId?: string | string[];
    taskId?: string | string[];
    experienceShowHidden?: string | string[];
  }>;
}

/** Module panels that only need project chrome - not WP/phase/milestone rows. */
const MODULE_PANEL_TABS = new Set<ProjectTabKey>([
  'financials',
  'expenses',
  'changes',
  'boq',
  'billing',
  'billingPlan',
  'budgets',
  'team',
  'schedule',
  'time',
  'documents',
  'usage',
  'closeout',
  'warranty',
  'infra',
]);

function tabFromSearchParams(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? DEFAULT_PROJECT_TAB;
  return raw ?? DEFAULT_PROJECT_TAB;
}

function experienceShowHiddenFromSearchParams(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'projects' });
  try {
    // Chrome-only is enough for the document title; shares cache with layout.
    const detail = await loadProjectDetail(projectId, false);
    return { title: titleWithDocumentNumber(detail.project.name, detail.project.documentNumber ?? '') };
  } catch {
    return { title: t('workspace.fallbackTitle') };
  }
}

/**
 * Tab panel segment - re-runs on `?tab=` soft-nav.
 * Stable header / metrics / tab list live in `layout.tsx`.
 *
 * Overview / work / details return a Suspense boundary before awaiting
 * structure so open-project soft-nav can commit layout chrome (heading + tabs)
 * without waiting on WP/phase/milestone rows.
 */
export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const [{ locale, projectId }, search] = await Promise.all([params, searchParams]);
  const tabParam = tabFromSearchParams(search.tab);
  const resolvedTab = resolveHubFromTabParam(tabParam);

  if (MODULE_PANEL_TABS.has(resolvedTab.section)) {
    return renderModuleTab({
      activeTab: resolvedTab.section,
      projectId,
      boqContractId:
        typeof search.contractId === 'string' ? search.contractId : search.contractId?.[0],
      cycleId: typeof search.cycleId === 'string' ? search.cycleId : search.cycleId?.[0],
      infraTaskId: typeof search.taskId === 'string' ? search.taskId : search.taskId?.[0],
      experienceShowHidden: experienceShowHiddenFromSearchParams(search.experienceShowHidden),
    });
  }

  const activeTab = resolvedTab.section;

  return (
    <Suspense fallback={<TabPanelSkeleton />}>
      <ProjectStructuredTabPanel projectId={projectId} locale={locale} activeTab={activeTab} />
    </Suspense>
  );
}

async function ProjectStructuredTabPanel({
  projectId,
  locale,
  activeTab,
}: {
  projectId: string;
  locale: string;
  activeTab: ProjectTabKey;
}) {
  if (activeTab === 'work') {
    return (
      <div className="pt-4">
        <Suspense fallback={<TabPanelSkeleton />}>
          <ProjectWorkWorkspace projectId={projectId} locale={locale} />
        </Suspense>
      </div>
    );
  }

  if (activeTab === 'details') {
    return (
      <div className="pt-4">
        <Suspense fallback={<TabPanelSkeleton />}>
          <ProjectDetailsWorkspace projectId={projectId} locale={locale} />
        </Suspense>
      </div>
    );
  }

  return null;
}

function renderModuleTab(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
  infraTaskId?: string;
  experienceShowHidden?: boolean;
}) {
  return (
    <div className="pt-4">
      <Suspense fallback={<TabPanelSkeleton />}>
        <ModuleTabWithHubNav {...input} />
      </Suspense>
    </div>
  );
}

async function ModuleTabWithHubNav(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
  infraTaskId?: string;
  experienceShowHidden?: boolean;
}) {
  const { hub, section } = resolveHubFromTabParam(input.activeTab);
  const [locale, shell, prefShowHidden] = await Promise.all([
    getLocale(),
    getShellContextForProject(input.projectId),
    readExperienceShowHiddenProjectTabsCookie(),
  ]);
  const direction = localeDirection(locale);

  const can = (permission: PermissionKey) => shell?.permissions.has(permission) ?? false;

  return withOrgContext(async (context) => {
    const modules = await getModuleVisibility(context);
    const detail = await loadProjectDetail(input.projectId, false);
    const experienceProfile = resolveProjectExperienceProfile({
      stored: detail.project.experienceProfile ?? null,
      workKind: detail.project.workKind ?? 'project',
      businessProfileKey: shell?.businessProfileKey ?? null,
      boqModuleEnabled: Boolean(modules.boq),
    });
    const resolved = resolveProjectTabVisibility({
      moduleVisibility: {
        financials:
          can(PERMISSIONS.PROJECT_FINANCIALS_READ) || can(PERMISSIONS.CONTRACTS_READ),
        expenses: can(PERMISSIONS.EXPENSES_READ),
        changes: Boolean(modules.changes) && can(PERMISSIONS.CHANGES_READ),
        boq: Boolean(modules.boq) && can(PERMISSIONS.BOQ_READ),
        billing: Boolean(modules.billing) && can(PERMISSIONS.BILLING_READ),
        billingPlan: Boolean(modules.billing) && can(PERMISSIONS.BILLING_READ),
        budgets: Boolean(modules.budgets) && can(PERMISSIONS.BUDGETS_READ),
        team: can(PERMISSIONS.WORKFORCE_READ),
        schedule: can(PERMISSIONS.PLANNING_READ),
        time: can(PERMISSIONS.WORKFORCE_READ),
        documents: resolveProjectFilesTabVisible(can(PERMISSIONS.DOCUMENTS_READ)),
        infra: resolveProjectFilesTabVisible(can(PERMISSIONS.DOCUMENTS_READ)),
        usage: can(PERMISSIONS.MATERIALS_READ) || can(PERMISSIONS.ASSETS_READ),
        work: detail.project.workKind === 'project',
        closeout: true,
        warranty: true,
      },
      experienceProfile,
      detail,
      experienceFamily: shell?.experienceFamily ?? 'project_contracting',
      customizationMode: shell?.customizationMode ?? null,
      experienceUiOverrides: shell?.experienceUiOverrides ?? {},
    });
    const showHidden = Boolean(input.experienceShowHidden) || prefShowHidden;
    const sections = hubSectionsForDisplay(hub, resolved, showHidden);
    const allSections = hubSectionsForDisplay(hub, resolved, true);
    const hiddenCount = allSections.length - hubSectionsForDisplay(hub, resolved, false).length;
    const sectionKey = section as keyof typeof resolved.display;
    const canAccessSection =
      sections.includes(section) ||
      (resolved.base[sectionKey] && !resolved.display[sectionKey]);
    const activeSection = canAccessSection ? section : (sections[0] ?? section);
    const panel = await loadActiveModulePanel({ ...input, activeTab: activeSection });

    return (
      <MainAppPage>
      <MainAppSection>
        {sections.length > 1 || hiddenCount > 0 ? (
          <ProjectHubSectionNav
            hub={hub}
            sections={sections}
            activeSection={activeSection}
            projectHref={`/projects/${input.projectId}`}
            dir={direction}
            experienceHiddenCount={hiddenCount}
            experienceShowHidden={showHidden}
          />
        ) : null}
        {panel}
      
      </MainAppSection>
    </MainAppPage>
    );
  });
}

async function loadActiveModulePanel(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
  infraTaskId?: string;
}) {
  const { activeTab, projectId } = input;

  switch (activeTab) {
    case 'financials': {
      const { ProjectFinancialsPanel } = await import(
        '@/modules/financials/ui/project-financials-panel'
      );
      return <ProjectFinancialsPanel projectId={projectId} />;
    }
    case 'expenses': {
      const { ProjectExpensesPanel } = await import('@/modules/expenses/ui/project-expenses-panel');
      return <ProjectExpensesPanel projectId={projectId} />;
    }
    case 'changes': {
      const { ProjectChangesPanel } = await import('@/modules/commercial/ui/project-changes-panel');
      return <ProjectChangesPanel projectId={projectId} />;
    }
    case 'boq': {
      const { ProjectBoqPanel } = await import('@/modules/boq/ui/project-boq-panel');
      return <ProjectBoqPanel projectId={projectId} contractId={input.boqContractId} />;
    }
    case 'billing': {
      const { ProjectBillingPanel } = await import('@/modules/billing/ui/project-billing-panel');
      return <ProjectBillingPanel projectId={projectId} contractId={input.boqContractId} />;
    }
    case 'billingPlan': {
      const { ProjectBillingPlanPanel } = await import(
        '@/modules/billing-plan/ui/project-billing-plan-panel'
      );
      return (
        <ProjectBillingPlanPanel
          projectId={projectId}
          contractId={input.boqContractId}
          cycleId={input.cycleId}
        />
      );
    }
    case 'budgets': {
      const { ProjectBudgetPanel } = await import('@/modules/budgets/ui/project-budget-panel');
      return <ProjectBudgetPanel projectId={projectId} />;
    }
    case 'team': {
      const { ProjectTeamPanel } = await import('@/modules/workforce/ui/project-team-panel');
      return <ProjectTeamPanel projectId={projectId} />;
    }
    case 'usage': {
      const { ProjectUsagePanel } = await import('@/modules/assets/ui/project-usage-panel');
      return <ProjectUsagePanel projectId={projectId} />;
    }
    case 'schedule': {
      const { ProjectSchedulePanel } = await import('@/modules/planning/ui/project-schedule-panel');
      return <ProjectSchedulePanel projectId={projectId} />;
    }
    case 'time': {
      const { ProjectTimePanel } = await import('@/modules/workforce/ui/project-time-panel');
      return <ProjectTimePanel projectId={projectId} />;
    }
    case 'documents': {
      const [{ DocumentsTab }, chrome] = await Promise.all([
        import('./documents-tab'),
        loadProjectDetail(projectId, false),
      ]);
      return (
        <DocumentsTab
          projectId={projectId}
          primaryContractId={chrome.contract?.id ?? null}
        />
      );
    }
    case 'infra': {
      const { InfraWorkspaceMain } = await import('@/modules/infra-mapping/ui/infra-workspace-main');
      return <InfraWorkspaceMain projectId={projectId} taskId={input.infraTaskId ?? null} />;
    }
    case 'closeout': {
      const { ProjectCloseoutPanel } = await import('@/modules/closeout/ui/project-closeout-panel');
      return <ProjectCloseoutPanel projectId={projectId} />;
    }
    case 'warranty': {
      const { ProjectWarrantyPanel } = await import('@/modules/warranty/ui/project-warranty-panel');
      return <ProjectWarrantyPanel projectId={projectId} />;
    }
    default:
      return null;
  }
}

