import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import {
  listProjectsForOrg,
  selectProjectWorkspaceLinks,
} from '@/modules/projects';
import {
  listOrgPhasePacks,
  listOrgProjectTemplatesForApply,
  listOrgWorkPackagePacks,
  resolveProjectExperienceProfile,
  titleWithDocumentNumber,
} from '@/modules/tenancy';
import { getShellContext, withOrgContext, type ShellContext } from '@/shared/auth/session';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { redirect } from '@/shared/i18n/navigation';
import { ProjectContractorsPanel } from '@/modules/vendors/ui';
import { DetailsTab } from './details-tab';
import { OverviewTab } from './overview-tab';
import { OverviewWorkSetup } from './overview-work-setup';
import { loadOrgBusinessProfileKey, loadProjectDetail } from './load-project-detail';
import { loadProjectFinancials } from './load-project-financials';
import {
  OverviewMilestonesPanel,
  OverviewSchedulePanel,
  OverviewStructureFallback,
} from './overview-schedule-milestones';
import {
  applyProjectProfileToTabVisibility,
  resolveProjectTabs,
} from './project-tab-order';
import { type ProjectTabKey } from './project-tabs-shell';
import { ProjectFieldOpsSummaryPanel } from './project-field-ops-summary';
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { WorkTab } from './work-tab';
import { ProjectFormsPanel } from '@/modules/forms/ui';
import { SkeletonText } from '@/components/ui/skeleton';

interface ProjectPageProps {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    contractId?: string | string[];
    cycleId?: string | string[];
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
]);

function tabFromSearchParams(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? 'overview';
  return raw ?? 'overview';
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
  const [{ locale, projectId }, search, shell] = await Promise.all([
    params,
    searchParams,
    getShellContext(),
  ]);
  const tabParam = tabFromSearchParams(search.tab);

  const can = (permission: PermissionKey) => shell?.permissions.has(permission) ?? false;
  const modules = shell?.modules;

  const canReadFinancials =
    (shell?.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      shell?.permissions.has(PERMISSIONS.CONTRACTS_READ)) ??
    false;
  const showExpensesTab = can(PERMISSIONS.EXPENSES_READ);
  const showChangesTab = Boolean(modules?.changes) && can(PERMISSIONS.CHANGES_READ);
  const showBoqTab = Boolean(modules?.boq) && can(PERMISSIONS.BOQ_READ);
  const showBillingTab = Boolean(modules?.billing) && can(PERMISSIONS.BILLING_READ);
  const showBillingPlanTab = showBillingTab;
  const showBudgetsTab = Boolean(modules?.budgets) && can(PERMISSIONS.BUDGETS_READ);
  const showTeamTab = can(PERMISSIONS.WORKFORCE_READ);
  // Schedule is permission-gated (not module) - `planning` is not in OPTIONAL_MODULE_KEYS.
  const showScheduleTab = can(PERMISSIONS.PLANNING_READ);
  const showTimeTab = can(PERMISSIONS.WORKFORCE_READ);
  const showDocumentsTab = Boolean(modules?.documents) && can(PERMISSIONS.DOCUMENTS_READ);
  const showUsageTab = can(PERMISSIONS.MATERIALS_READ) || can(PERMISSIONS.ASSETS_READ);

  // Chrome-only - shares React cache with layout; job redirect without structure.
  // Warm structure (and overview snapshot financials) in parallel with chrome.
  const [chrome, businessProfileKey] = await Promise.all([
    loadProjectDetail(projectId, false).catch(() => null),
    loadOrgBusinessProfileKey(),
  ]);
  if (!chrome) notFound();

  if (chrome.project.workKind === 'job') {
    const tabSuffix =
      tabParam && tabParam !== 'overview' ? `?tab=${encodeURIComponent(tabParam)}` : '';
    redirect({ href: `/jobs/${projectId}${tabSuffix}`, locale });
  }

  if (chrome.project.workKind === 'work_order') {
    redirect({ href: `/work-orders/${projectId}`, locale });
  }

  const showWorkTab = chrome.showWorkPackages;
  const canEditProjects = can(PERMISSIONS.PROJECTS_UPDATE);

  const experienceProfile = resolveProjectExperienceProfile({
    stored: chrome.project.experienceProfile,
    workKind: chrome.project.workKind,
    businessProfileKey,
    boqModuleEnabled: Boolean(modules?.boq),
  });

  const tabVisibility = applyProjectProfileToTabVisibility(
    {
      financials: canReadFinancials,
      expenses: showExpensesTab,
      changes: showChangesTab,
      boq: showBoqTab,
      billing: showBillingTab,
      billingPlan: showBillingPlanTab,
      budgets: showBudgetsTab,
      team: showTeamTab,
      schedule: showScheduleTab,
      time: showTimeTab,
      documents: showDocumentsTab,
      usage: showUsageTab,
      work: showWorkTab,
      closeout: true,
      warranty: true,
    },
    experienceProfile,
  );

  const visibleModuleTabs = new Set<string>();
  if (tabVisibility.financials) visibleModuleTabs.add('financials');
  if (tabVisibility.expenses) visibleModuleTabs.add('expenses');
  if (tabVisibility.changes) visibleModuleTabs.add('changes');
  if (tabVisibility.boq) visibleModuleTabs.add('boq');
  if (tabVisibility.billing) visibleModuleTabs.add('billing');
  if (tabVisibility.billingPlan) visibleModuleTabs.add('billingPlan');
  if (tabVisibility.budgets) visibleModuleTabs.add('budgets');
  if (tabVisibility.team) visibleModuleTabs.add('team');
  if (tabVisibility.schedule) visibleModuleTabs.add('schedule');
  if (tabVisibility.time) visibleModuleTabs.add('time');
  if (tabVisibility.documents) visibleModuleTabs.add('documents');
  if (tabVisibility.usage) visibleModuleTabs.add('usage');
  if (tabVisibility.closeout) visibleModuleTabs.add('closeout');
  if (tabVisibility.warranty) visibleModuleTabs.add('warranty');

  const isModuleTab =
    MODULE_PANEL_TABS.has(tabParam as ProjectTabKey) && visibleModuleTabs.has(tabParam);

  if (!isModuleTab) {
    void loadProjectDetail(projectId, true);
    if (canReadFinancials && tabParam === 'overview') {
      void loadProjectFinancials(projectId).catch(() => null);
    }
  }

  const tabs: ProjectTabKey[] = resolveProjectTabs(tabVisibility);

  const activeTab: ProjectTabKey = tabs.includes(tabParam as ProjectTabKey)
    ? (tabParam as ProjectTabKey)
    : (tabs[0] ?? 'overview');

  if (isModuleTab) {
    return await renderModuleTab({
      activeTab,
      projectId,
      boqContractId: typeof search.contractId === 'string' ? search.contractId : search.contractId?.[0],
      cycleId: typeof search.cycleId === 'string' ? search.cycleId : search.cycleId?.[0],
      showExpensesTab,
      showChangesTab,
      showBoqTab,
      showBillingTab,
      showBillingPlanTab,
      showBudgetsTab,
      showTeamTab,
      showScheduleTab,
      showTimeTab,
      showDocumentsTab,
      showUsageTab,
      canReadFinancials,
      hasContract: Boolean(chrome.contract),
      experienceProfile,
    });
  }

  // Structure tabs: stream behind Suspense so layout chrome is not blocked.
  return (
    <Suspense fallback={<TabPanelSkeleton />}>
      <ProjectStructuredTabPanel
        projectId={projectId}
        locale={locale}
        activeTab={activeTab}
        shell={shell}
        canReadFinancials={canReadFinancials}
        canEditProjects={canEditProjects}
        showWorkTab={showWorkTab}
      />
    </Suspense>
  );
}

async function ProjectStructuredTabPanel({
  projectId,
  locale,
  activeTab,
  shell,
  canReadFinancials,
  canEditProjects,
  showWorkTab,
}: {
  projectId: string;
  locale: string;
  activeTab: ProjectTabKey;
  shell: ShellContext | null;
  canReadFinancials: boolean;
  canEditProjects: boolean;
  showWorkTab: boolean;
}) {
  const includeStructure = activeTab !== 'overview';
  const detail = await loadProjectDetail(projectId, includeStructure).catch(() => null);
  if (!detail) notFound();

  const uiLocale = locale === 'he-IL' ? 'he-IL' : 'en';
  const modules = shell?.modules;
  /** Optional contractors panel on overview - no `contractors` tab (avoids schedule conflict). */
  const showContractorsPanel = shell?.permissions.has(PERMISSIONS.VENDORS_READ) ?? false;
  const workspaceLinks = selectProjectWorkspaceLinks({
    projectId,
    modules: modules ?? {},
    permissions: shell?.permissions ?? new Set(),
    showWorkPackages: showWorkTab,
    canReadFinancials,
  });
  const organizationTimezone = shell?.organization.timezone ?? 'Asia/Jerusalem';

  const canManageContract = shell?.permissions.has(PERMISSIONS.CONTRACTS_MANAGE) ?? false;
  const baseCurrency =
    detail.contract?.currency ??
    detail.project.currency ??
    shell?.organization.baseCurrency ??
    'ILS';
  const sample = formatMoney(zeroMoney(baseCurrency), locale, {
    currencyDisplay: 'narrowSymbol',
  });
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

  const needsDetailsExtras = activeTab === 'details';
  const needsWorkExtras = canEditProjects && activeTab === 'work';

  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let orgTemplates: Awaited<ReturnType<typeof listOrgProjectTemplatesForApply>> = [];
  let phasePacks: Awaited<ReturnType<typeof listOrgPhasePacks>> = [];
  let workPackagePacks: Awaited<ReturnType<typeof listOrgWorkPackagePacks>> = [];
  let cloneCandidates: { id: string; name: string }[] = [];
  let clients: {
    id: string;
    name: string;
    contacts: { id: string; name: string; phone: string | null; role: string }[];
  }[] = [];

  if (needsDetailsExtras || needsWorkExtras) {
    const extras = await withOrgContext(async (context) => {
      const [fields, templates, phases, wpPacks, projects, clientRows] = await Promise.all([
        needsDetailsExtras
          ? listCustomFieldValuesForEntity(context, 'project', projectId).catch(() => [])
          : Promise.resolve([]),
        needsWorkExtras
          ? listOrgProjectTemplatesForApply(context).catch(() => [])
          : Promise.resolve([]),
        needsWorkExtras ? listOrgPhasePacks(context).catch(() => []) : Promise.resolve([]),
        needsWorkExtras ? listOrgWorkPackagePacks(context).catch(() => []) : Promise.resolve([]),
        needsWorkExtras ? listProjectsForOrg(context, {}).catch(() => []) : Promise.resolve([]),
        needsDetailsExtras ? listClientsForOrg(context, {}).catch(() => []) : Promise.resolve([]),
      ]);
      const contacts = needsDetailsExtras
        ? await listContactsForClients(
            context,
            clientRows.map((client) => client.id),
          ).catch(() => [])
        : [];
      const contactsByClient = new Map<
        string,
        { id: string; name: string; phone: string | null; role: string }[]
      >();
      for (const contact of contacts) {
        const list = contactsByClient.get(contact.clientId) ?? [];
        list.push({
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          role: contact.role,
        });
        contactsByClient.set(contact.clientId, list);
      }
      return {
        fields,
        templates,
        phases,
        wpPacks,
        cloneCandidates: projects
          .filter((row) => row.id !== projectId)
          .map((row) => ({ id: row.id, name: row.name })),
        clients: clientRows.map((client) => ({
          id: client.id,
          name: client.name,
          contacts: contactsByClient.get(client.id) ?? [],
        })),
      };
    });
    customFields = extras.fields;
    orgTemplates = extras.templates;
    phasePacks = extras.phases;
    workPackagePacks = extras.wpPacks;
    cloneCandidates = extras.cloneCandidates;
    clients = extras.clients;
  }

  return (
    <>
      {activeTab === 'overview' ? (
        <div className="pt-4">
          <div className="flex flex-col gap-4">
            {Boolean(modules?.field_ops) &&
            (shell?.permissions.has(PERMISSIONS.FIELD_OPS_READ) ?? false) ? (
              <Suspense fallback={<TabPanelSkeleton />}>
                <ProjectFieldOpsSummaryPanel projectId={projectId} />
              </Suspense>
            ) : null}
            {Boolean(modules?.forms) &&
            (shell?.permissions.has(PERMISSIONS.FORMS_READ) ?? false) ? (
              <Suspense fallback={<TabPanelSkeleton />}>
                <ProjectFormsPanel ownerType="project" ownerId={projectId} />
              </Suspense>
            ) : null}
            <OverviewTab
              detail={detail}
              locale={locale}
              canReadFinancials={canReadFinancials}
              canEdit={canEditProjects}
              workspaceLinks={workspaceLinks}
              organizationTimezone={organizationTimezone}
              scheduleSlot={
                <Suspense fallback={<OverviewStructureFallback />}>
                  <OverviewSchedulePanel
                    projectId={projectId}
                    organizationTimezone={organizationTimezone}
                  />
                </Suspense>
              }
              milestonesSlot={
                <Suspense fallback={<SkeletonText lines={3} />}>
                  <OverviewMilestonesPanel
                    projectId={projectId}
                    canEdit={canEditProjects}
                    organizationTimezone={organizationTimezone}
                  />
                </Suspense>
              }
            />
            {showContractorsPanel ? (
              <Suspense fallback={<TabPanelSkeleton />}>
                <ProjectContractorsPanel projectId={projectId} />
              </Suspense>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'work' && showWorkTab ? (
        <div className="pt-4">
          <WorkTab
            detail={detail}
            canEdit={canEditProjects}
            locale={uiLocale}
            orgTemplates={orgTemplates}
            phasePacks={phasePacks}
            workPackagePacks={workPackagePacks}
            cloneCandidates={cloneCandidates}
          />
        </div>
      ) : null}

      {activeTab === 'details' ? (
        <div className="pt-4">
          <DetailsTab
            detail={detail}
            clients={clients}
            baseCurrency={baseCurrency}
            currencySymbol={currencySymbol}
            canManageContract={canManageContract}
            customFields={customFields}
            taxRatePercent={detail.contract?.taxSnapshot?.ratePercent ?? null}
          />
        </div>
      ) : null}

      {!showWorkTab && activeTab === 'overview' ? (
        <OverviewWorkSetup
          projectId={projectId}
          detail={detail}
          canEdit={canEditProjects}
          locale={uiLocale}
        />
      ) : null}
    </>
  );
}

async function renderModuleTab(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
  showExpensesTab: boolean;
  showChangesTab: boolean;
  showBoqTab: boolean;
  showBillingTab: boolean;
  showBillingPlanTab: boolean;
  showBudgetsTab: boolean;
  showTeamTab: boolean;
  showScheduleTab: boolean;
  showTimeTab: boolean;
  showDocumentsTab: boolean;
  showUsageTab: boolean;
  canReadFinancials: boolean;
  hasContract: boolean;
  experienceProfile: string;
}) {
  // Import only the active module panel so overview / sibling tabs do not
  // pull financials, expenses, billing, team, … client graphs into this Flight.
  const panel = await loadActiveModulePanel(input);
  if (!panel) return null;

  return (
    <div className="pt-4">
      <Suspense fallback={<TabPanelSkeleton />}>{panel}</Suspense>
    </div>
  );
}

async function loadActiveModulePanel(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
  showExpensesTab: boolean;
  showChangesTab: boolean;
  showBoqTab: boolean;
  showBillingTab: boolean;
  showBillingPlanTab: boolean;
  showBudgetsTab: boolean;
  showTeamTab: boolean;
  showScheduleTab: boolean;
  showTimeTab: boolean;
  showDocumentsTab: boolean;
  showUsageTab: boolean;
  canReadFinancials: boolean;
  hasContract: boolean;
  experienceProfile: string;
}) {
  const { activeTab, projectId } = input;

  switch (activeTab) {
    case 'financials': {
      if (!input.canReadFinancials) return null;
      const { ProjectFinancialsPanel } = await import(
        '@/modules/financials/ui/project-financials-panel'
      );
      return <ProjectFinancialsPanel projectId={projectId} />;
    }
    case 'expenses': {
      if (!input.showExpensesTab) return null;
      const { ProjectExpensesPanel } = await import('@/modules/expenses/ui/project-expenses-panel');
      return <ProjectExpensesPanel projectId={projectId} />;
    }
    case 'changes': {
      if (!input.showChangesTab) return null;
      const { ProjectChangesPanel } = await import('@/modules/commercial/ui/project-changes-panel');
      return <ProjectChangesPanel projectId={projectId} />;
    }
    case 'boq': {
      if (!input.showBoqTab) return null;
      const { ProjectBoqPanel } = await import('@/modules/boq/ui/project-boq-panel');
      return <ProjectBoqPanel projectId={projectId} contractId={input.boqContractId} />;
    }
    case 'billing': {
      if (!input.showBillingTab) return null;
      const { ProjectBillingPanel } = await import('@/modules/billing/ui/project-billing-panel');
      return <ProjectBillingPanel projectId={projectId} contractId={input.boqContractId} />;
    }
    case 'billingPlan': {
      if (!input.showBillingPlanTab) return null;
      const { ProjectBillingPlanPanel } = await import(
        '@/modules/billing-plan/ui/project-billing-plan-panel'
      );
      const simplified =
        input.experienceProfile === 'simple' || input.experienceProfile === 'small_job';
      return (
        <ProjectBillingPlanPanel
          projectId={projectId}
          contractId={input.boqContractId}
          cycleId={input.cycleId}
          simplified={simplified}
        />
      );
    }
    case 'budgets': {
      if (!input.showBudgetsTab) return null;
      const { ProjectBudgetPanel } = await import('@/modules/budgets/ui/project-budget-panel');
      return <ProjectBudgetPanel projectId={projectId} />;
    }
    case 'team': {
      if (!input.showTeamTab) return null;
      const { ProjectTeamPanel } = await import('@/modules/workforce/ui/project-team-panel');
      return <ProjectTeamPanel projectId={projectId} />;
    }
    case 'usage': {
      if (!input.showUsageTab) return null;
      const { ProjectUsagePanel } = await import('@/modules/assets/ui/project-usage-panel');
      return <ProjectUsagePanel projectId={projectId} />;
    }
    case 'schedule': {
      if (!input.showScheduleTab) return null;
      const { ProjectSchedulePanel } = await import('@/modules/planning/ui/project-schedule-panel');
      return <ProjectSchedulePanel projectId={projectId} />;
    }
    case 'time': {
      if (!input.showTimeTab) return null;
      const { ProjectTimePanel } = await import('@/modules/workforce/ui/project-time-panel');
      return <ProjectTimePanel projectId={projectId} />;
    }
    case 'documents': {
      if (!input.showDocumentsTab) return null;
      const { DocumentsTab } = await import('./documents-tab');
      return <DocumentsTab projectId={projectId} hasContract={input.hasContract} />;
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

