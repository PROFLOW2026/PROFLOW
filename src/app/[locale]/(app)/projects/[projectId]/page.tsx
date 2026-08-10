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
} from '@/modules/tenancy';
import { getShellContext, withOrgContext, type ShellContext } from '@/shared/auth/session';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { redirect } from '@/shared/i18n/navigation';
import { ProjectBillingPanel } from '@/modules/billing/ui';
import { ProjectChangesPanel } from '@/modules/commercial/ui';
import { ProjectExpensesPanel } from '@/modules/expenses/ui';
import { ProjectFinancialsPanel } from '@/modules/financials/ui';
import { ProjectTeamPanel, ProjectTimePanel } from '@/modules/workforce/ui';
import { DetailsTab } from './details-tab';
import { DocumentsTab } from './documents-tab';
import { OverviewTab } from './overview-tab';
import { OverviewWorkSetup } from './overview-work-setup';
import { loadProjectDetail } from './load-project-detail';
import { resolveProjectTabs } from './project-tab-order';
import { type ProjectTabKey } from './project-tabs-shell';
import { ProjectFieldOpsSummaryPanel } from './project-field-ops-summary';
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { WorkTab } from './work-tab';

interface ProjectPageProps {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

/** Module panels that only need project chrome — not WP/phase/milestone rows. */
const MODULE_PANEL_TABS = new Set<ProjectTabKey>([
  'financials',
  'expenses',
  'changes',
  'billing',
  'team',
  'time',
  'documents',
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
    return { title: detail.project.name };
  } catch {
    return { title: t('workspace.fallbackTitle') };
  }
}

/**
 * Tab panel segment — re-runs on `?tab=` soft-nav.
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
  const showBillingTab = Boolean(modules?.billing) && can(PERMISSIONS.BILLING_READ);
  const showTeamTab = can(PERMISSIONS.WORKFORCE_READ);
  const showTimeTab = can(PERMISSIONS.WORKFORCE_READ);
  const showDocumentsTab = Boolean(modules?.documents) && can(PERMISSIONS.DOCUMENTS_READ);

  const visibleModuleTabs = new Set<string>();
  if (canReadFinancials) visibleModuleTabs.add('financials');
  if (showExpensesTab) visibleModuleTabs.add('expenses');
  if (showChangesTab) visibleModuleTabs.add('changes');
  if (showBillingTab) visibleModuleTabs.add('billing');
  if (showTeamTab) visibleModuleTabs.add('team');
  if (showTimeTab) visibleModuleTabs.add('time');
  if (showDocumentsTab) visibleModuleTabs.add('documents');

  const isModuleTab =
    MODULE_PANEL_TABS.has(tabParam as ProjectTabKey) && visibleModuleTabs.has(tabParam);

  // Chrome-only — shares React cache with layout; job redirect without structure.
  const chrome = await loadProjectDetail(projectId, false).catch(() => null);
  if (!chrome) notFound();

  if (chrome.project.workKind === 'job') {
    const tabSuffix =
      tabParam && tabParam !== 'overview' ? `?tab=${encodeURIComponent(tabParam)}` : '';
    redirect({ href: `/jobs/${projectId}${tabSuffix}`, locale });
  }

  const showWorkTab = chrome.showWorkPackages;
  const canEditProjects = can(PERMISSIONS.PROJECTS_UPDATE);

  const tabs: ProjectTabKey[] = resolveProjectTabs({
    financials: canReadFinancials,
    expenses: showExpensesTab,
    changes: showChangesTab,
    billing: showBillingTab,
    team: showTeamTab,
    time: showTimeTab,
    documents: showDocumentsTab,
    work: showWorkTab,
  });

  const activeTab: ProjectTabKey = tabs.includes(tabParam as ProjectTabKey)
    ? (tabParam as ProjectTabKey)
    : (tabs[0] ?? 'overview');

  if (isModuleTab) {
    return renderModuleTab({
      activeTab,
      projectId,
      showExpensesTab,
      showChangesTab,
      showBillingTab,
      showTeamTab,
      showTimeTab,
      showDocumentsTab,
      canReadFinancials,
      hasContract: Boolean(chrome.contract),
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
  const detail = await loadProjectDetail(projectId, true).catch(() => null);
  if (!detail) notFound();

  const uiLocale = locale === 'he-IL' ? 'he-IL' : 'en';
  const modules = shell?.modules;
  const workspaceLinks = selectProjectWorkspaceLinks({
    projectId,
    modules: modules ?? {},
    permissions: shell?.permissions ?? new Set(),
    showWorkPackages: showWorkTab,
    canReadFinancials,
  });

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
            <OverviewTab
              detail={detail}
              locale={locale}
              canReadFinancials={canReadFinancials}
              canEdit={canEditProjects}
              workspaceLinks={workspaceLinks}
              organizationTimezone={shell?.organization.timezone ?? 'Asia/Jerusalem'}
            />
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

function renderModuleTab(input: {
  activeTab: ProjectTabKey;
  projectId: string;
  showExpensesTab: boolean;
  showChangesTab: boolean;
  showBillingTab: boolean;
  showTeamTab: boolean;
  showTimeTab: boolean;
  showDocumentsTab: boolean;
  canReadFinancials: boolean;
  hasContract: boolean;
}) {
  const {
    activeTab,
    projectId,
    showExpensesTab,
    showChangesTab,
    showBillingTab,
    showTeamTab,
    showTimeTab,
    showDocumentsTab,
    canReadFinancials,
    hasContract,
  } = input;

  return (
    <>
      {activeTab === 'financials' && canReadFinancials ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <ProjectFinancialsPanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'expenses' && showExpensesTab ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <ProjectExpensesPanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'changes' && showChangesTab ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <ProjectChangesPanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'billing' && showBillingTab ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <ProjectBillingPanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'team' && showTeamTab ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <ProjectTeamPanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'time' && showTimeTab ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <ProjectTimePanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}

      {activeTab === 'documents' && showDocumentsTab ? (
        <div className="pt-4">
          <Suspense fallback={<TabPanelSkeleton />}>
            <DocumentsTab projectId={projectId} hasContract={hasContract} />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}
