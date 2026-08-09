import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { TabsContent } from '@/components/ui/tabs';
import { listClientsForOrg } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import {
  getProjectDetail,
  listProjectsForOrg,
  selectProjectWorkspaceLinks,
} from '@/modules/projects';
import {
  listOrgPhasePacks,
  listOrgProjectTemplatesForApply,
  listOrgWorkPackagePacks,
} from '@/modules/tenancy';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { ProjectBillingPanel } from '@/modules/billing/ui';
import { ProjectChangesPanel } from '@/modules/commercial/ui';
import { ProjectExpensesPanel } from '@/modules/expenses/ui';
import { ProjectFinancialsPanel } from '@/modules/financials/ui';
import { ProjectTimePanel } from '@/modules/workforce/ui';
import { ArchiveProjectButton } from './archive-project-button';
import { DetailsTab } from './details-tab';
import { DocumentsTab } from './documents-tab';
import { OverviewTab } from './overview-tab';
import { ProjectHeaderMetrics } from './project-header-metrics';
import { ProjectStatusBadge } from '../project-status-badge';
import { ProjectTabsShell, type ProjectTabKey } from './project-tabs-shell';
import { ProjectFieldOpsSummaryPanel } from './project-field-ops-summary';
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { WorkTab } from './work-tab';

interface ProjectPageProps {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

function tabFromSearchParams(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? 'overview';
  return raw ?? 'overview';
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { locale, projectId } = await params;
  const t = await getTranslations({ locale, namespace: 'projects' });
  try {
    const detail = await withOrgContext((context) => getProjectDetail(context, projectId));
    return { title: detail.project.name };
  } catch {
    return { title: t('workspace.fallbackTitle') };
  }
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { locale, projectId } = await params;
  const tabParam = tabFromSearchParams((await searchParams).tab);
  const t = await getTranslations('projects');
  const tStatus = await getTranslations('status.project');
  const shell = await getShellContext();

  let detail;
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let orgTemplates: Awaited<ReturnType<typeof listOrgProjectTemplatesForApply>> = [];
  let phasePacks: Awaited<ReturnType<typeof listOrgPhasePacks>> = [];
  let workPackagePacks: Awaited<ReturnType<typeof listOrgWorkPackagePacks>> = [];
  let cloneCandidates: { id: string; name: string }[] = [];
  let clients: { id: string; name: string }[] = [];

  try {
    const loaded = await withOrgContext(async (context) => {
      const projectDetail = await getProjectDetail(context, projectId);
      const [fields, templates, phases, wpPacks, projects, clientRows] = await Promise.all([
        listCustomFieldValuesForEntity(context, 'project', projectId).catch(() => []),
        listOrgProjectTemplatesForApply(context).catch(() => []),
        listOrgPhasePacks(context).catch(() => []),
        listOrgWorkPackagePacks(context).catch(() => []),
        listProjectsForOrg(context, {}).catch(() => []),
        listClientsForOrg(context, {}).catch(() => []),
      ]);
      return {
        projectDetail,
        fields,
        templates,
        phases,
        wpPacks,
        cloneCandidates: projects
          .filter((row) => row.id !== projectId)
          .map((row) => ({ id: row.id, name: row.name })),
        clients: clientRows.map((client) => ({ id: client.id, name: client.name })),
      };
    });
    detail = loaded.projectDetail;
    customFields = loaded.fields;
    orgTemplates = loaded.templates;
    phasePacks = loaded.phases;
    workPackagePacks = loaded.wpPacks;
    cloneCandidates = loaded.cloneCandidates;
    clients = loaded.clients;
  } catch {
    notFound();
  }

  const canReadFinancials =
    (shell?.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      shell?.permissions.has(PERMISSIONS.CONTRACTS_READ)) ??
    false;

  const can = (permission: PermissionKey) => shell?.permissions.has(permission) ?? false;
  const modules = shell?.modules;
  const showWorkTab = detail.showWorkPackages;
  const uiLocale = locale === 'he-IL' ? 'he-IL' : 'en';
  const workspaceLinks = selectProjectWorkspaceLinks({
    projectId,
    modules: modules ?? {},
    permissions: shell?.permissions ?? new Set(),
    showWorkPackages: showWorkTab,
    canReadFinancials,
  });

  const canArchive = shell?.permissions.has(PERMISSIONS.PROJECTS_ARCHIVE) ?? false;
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

  const showExpensesTab = can(PERMISSIONS.EXPENSES_READ);
  const showChangesTab = Boolean(modules?.changes) && can(PERMISSIONS.CHANGES_READ);
  const showBillingTab = Boolean(modules?.billing) && can(PERMISSIONS.BILLING_READ);
  const showTimeTab = Boolean(modules?.workforce) && can(PERMISSIONS.WORKFORCE_READ);
  const showDocumentsTab = Boolean(modules?.documents) && can(PERMISSIONS.DOCUMENTS_READ);

  const tabs: ProjectTabKey[] = [
    'overview',
    ...(canReadFinancials ? (['financials'] as const) : []),
    ...(showExpensesTab ? (['expenses'] as const) : []),
    ...(showChangesTab ? (['changes'] as const) : []),
    ...(showBillingTab ? (['billing'] as const) : []),
    ...(showWorkTab ? (['work'] as const) : []),
    ...(showTimeTab ? (['time'] as const) : []),
    ...(showDocumentsTab ? (['documents'] as const) : []),
    'details',
  ];

  const activeTab: ProjectTabKey = tabs.includes(tabParam as ProjectTabKey)
    ? (tabParam as ProjectTabKey)
    : (tabs[0] ?? 'overview');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.project.name}
        actions={canArchive ? <ArchiveProjectButton projectId={projectId} /> : null}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={detail.project.status} label={tStatus(detail.project.status)} />
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {detail.clientName && detail.project.clientId ? (
                t.rich('workspace.clientLinked', {
                  clientLabel: t('details.clientLabel'),
                  clientName: detail.clientName,
                  link: (chunks) => (
                    <Link href={`/clients/${detail.project.clientId}`} className="hover:underline">
                      {chunks}
                    </Link>
                  ),
                })
              ) : (
                t('workspace.noClient')
              )}
              {detail.project.location ? ` · ${detail.project.location}` : null}
            </span>
          </div>
        }
      />

      <ProjectHeaderMetrics currentContractValue={canReadFinancials ? detail.currentContractValue : null} />

      {!showWorkTab ? (
        <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
          <WorkTab
            detail={detail}
            canEdit={can(PERMISSIONS.PROJECTS_UPDATE)}
            locale={uiLocale}
            orgTemplates={orgTemplates}
            phasePacks={phasePacks}
            workPackagePacks={workPackagePacks}
            cloneCandidates={cloneCandidates}
          />
        </div>
      ) : null}

      <ProjectTabsShell tabs={tabs} activeTab={activeTab}>
        {activeTab === 'overview' ? (
          <TabsContent value="overview" forceMount>
            <div className="flex flex-col gap-4">
              {Boolean(modules?.field_ops) && can(PERMISSIONS.FIELD_OPS_READ) ? (
                <ProjectFieldOpsSummaryPanel projectId={projectId} />
              ) : null}
              <OverviewTab
                detail={detail}
                locale={locale}
                canReadFinancials={canReadFinancials}
                canEdit={can(PERMISSIONS.PROJECTS_UPDATE)}
                workspaceLinks={workspaceLinks}
                organizationTimezone={shell?.organization.timezone ?? 'Asia/Jerusalem'}
              />
            </div>
          </TabsContent>
        ) : null}

        {activeTab === 'financials' && canReadFinancials ? (
          <TabsContent value="financials" forceMount>
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectFinancialsPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {activeTab === 'expenses' && showExpensesTab ? (
          <TabsContent value="expenses" forceMount>
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectExpensesPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {activeTab === 'changes' && showChangesTab ? (
          <TabsContent value="changes" forceMount>
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectChangesPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {activeTab === 'billing' && showBillingTab ? (
          <TabsContent value="billing" forceMount>
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectBillingPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {activeTab === 'work' && showWorkTab ? (
          <TabsContent value="work" forceMount>
            <WorkTab
              detail={detail}
              canEdit={can(PERMISSIONS.PROJECTS_UPDATE)}
              locale={uiLocale}
              orgTemplates={orgTemplates}
              phasePacks={phasePacks}
              workPackagePacks={workPackagePacks}
              cloneCandidates={cloneCandidates}
            />
          </TabsContent>
        ) : null}

        {activeTab === 'time' && showTimeTab ? (
          <TabsContent value="time" forceMount>
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectTimePanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {activeTab === 'documents' && showDocumentsTab ? (
          <TabsContent value="documents" forceMount>
            <Suspense fallback={<TabPanelSkeleton />}>
              <DocumentsTab projectId={projectId} hasContract={Boolean(detail.contract)} />
            </Suspense>
          </TabsContent>
        ) : null}

        {activeTab === 'details' ? (
          <TabsContent value="details" forceMount>
            <DetailsTab
              detail={detail}
              clients={clients}
              baseCurrency={baseCurrency}
              currencySymbol={currencySymbol}
              canManageContract={canManageContract}
              customFields={customFields}
            />
          </TabsContent>
        ) : null}
      </ProjectTabsShell>
    </div>
  );
}
