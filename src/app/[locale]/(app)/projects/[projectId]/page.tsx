import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import {
  listProjectsForOrg,
  selectProjectWorkspaceLinks,
  assembleProjectDetail,
} from '@/modules/projects';
import {
  listOrgPhasePacks,
  listOrgProjectTemplatesForApply,
  listOrgWorkPackagePacks,
  titleWithDocumentNumber,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { getModuleVisibility } from '@/modules/tenancy';
import { loadProjectDetailInContext, loadProjectDetail } from './load-project-detail';
import { loadProjectOverviewCritical } from './load-project-overview-critical';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { ProjectContractorsPanel } from '@/modules/vendors/ui';
import { DetailsTab } from './details-tab';
import { OverviewTab } from './overview-tab';
import {
  OverviewMilestonesPanel,
  OverviewSchedulePanel,
  OverviewStructureFallback,
} from './overview-schedule-milestones';
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
  const [{ locale, projectId }, search] = await Promise.all([params, searchParams]);
  const tabParam = tabFromSearchParams(search.tab);

  if (MODULE_PANEL_TABS.has(tabParam as ProjectTabKey)) {
    return renderModuleTab({
      activeTab: tabParam as ProjectTabKey,
      projectId,
      boqContractId:
        typeof search.contractId === 'string' ? search.contractId : search.contractId?.[0],
      cycleId: typeof search.cycleId === 'string' ? search.cycleId : search.cycleId?.[0],
    });
  }

  const activeTab = (tabParam as ProjectTabKey) || 'overview';

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
  return withOrgContext(async (context) => {
    const modules = await getModuleVisibility(context);
    const can = (permission: PermissionKey) => context.permissions.has(permission);
    const canReadFinancials =
      can(PERMISSIONS.PROJECT_FINANCIALS_READ) || can(PERMISSIONS.CONTRACTS_READ);
    const canEditProjects = can(PERMISSIONS.PROJECTS_UPDATE);

    if (activeTab === 'overview') {
      const [critical, tFinancial] = await Promise.all([
        loadProjectOverviewCritical(context, projectId),
        getTranslations('financial'),
      ]);
      const detail = assembleProjectDetail(critical.detail, {
        workPackages: [],
        phases: [],
        milestones: [],
        activeCount: 0,
      });
      const organizationTimezone = context.organization.timezone ?? 'Asia/Jerusalem';
      const workspaceLinks = selectProjectWorkspaceLinks({
        projectId,
        modules,
        permissions: context.permissions,
        showWorkPackages: false,
        canReadFinancials,
      });

      return (
        <div className="pt-4">
          <div className="flex flex-col gap-4">
            {Boolean(modules.field_ops) && can(PERMISSIONS.FIELD_OPS_READ) ? (
              <Suspense fallback={<TabPanelSkeleton />}>
                <ProjectFieldOpsSummaryPanel projectId={projectId} />
              </Suspense>
            ) : null}
            {Boolean(modules.forms) && can(PERMISSIONS.FORMS_READ) ? (
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
              preloadedFinancials={critical.financials}
              preloadedCanReadProfit={critical.canReadProfit}
              financialSnapshotT={(key) => tFinancial(key as never)}
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
            {can(PERMISSIONS.VENDORS_READ) ? (
              <Suspense fallback={<TabPanelSkeleton />}>
                <ProjectContractorsPanel projectId={projectId} />
              </Suspense>
            ) : null}
          </div>
        </div>
      );
    }

    const includeStructure = true;
    const detail = await loadProjectDetailInContext(context, projectId, includeStructure);
    const showWorkTab = detail.showWorkPackages;

    const uiLocale = locale === 'he-IL' ? 'he-IL' : 'en';
    const showContractorsPanel = can(PERMISSIONS.VENDORS_READ);
    const workspaceLinks = selectProjectWorkspaceLinks({
      projectId,
      modules,
      permissions: context.permissions,
      showWorkPackages: detail.showWorkPackages,
      canReadFinancials,
    });
    const organizationTimezone = context.organization.timezone ?? 'Asia/Jerusalem';
    const canManageContract = can(PERMISSIONS.CONTRACTS_MANAGE);
    const baseCurrency =
      detail.contract?.currency ?? detail.project.currency ?? context.organization.baseCurrency ?? 'ILS';
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
      customFields = fields;
      orgTemplates = templates;
      phasePacks = phases;
      workPackagePacks = wpPacks;
      cloneCandidates = projects
        .filter((row) => row.id !== projectId)
        .map((row) => ({ id: row.id, name: row.name }));
      clients = clientRows.map((client) => ({
        id: client.id,
        name: client.name,
        contacts: contactsByClient.get(client.id) ?? [],
      }));
    }

    return (
      <>
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

      </>
    );
  });
}

function renderModuleTab(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
}) {
  return (
    <div className="pt-4">
      <Suspense fallback={<TabPanelSkeleton />}>
        <ActiveModuleTabPanel {...input} />
      </Suspense>
    </div>
  );
}

async function ActiveModuleTabPanel(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
}) {
  const panel = await loadActiveModulePanel(input);
  if (!panel) return null;
  return panel;
}

async function loadActiveModulePanel(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  boqContractId?: string;
  cycleId?: string;
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
      const { DocumentsTab } = await import('./documents-tab');
      return <DocumentsTab projectId={projectId} hasContract={false} />;
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

