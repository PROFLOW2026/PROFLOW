import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { TabsContent } from '@/components/ui/tabs';
import { listClientsForOrg } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { getProjectDetail } from '@/modules/projects';
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
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { WorkTab } from './work-tab';

interface ProjectPageProps {
  params: Promise<{ locale: string; projectId: string }>;
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

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { locale, projectId } = await params;
  const t = await getTranslations('projects');
  const tStatus = await getTranslations('status.project');
  const shell = await getShellContext();

  let detail;
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  try {
    const loaded = await withOrgContext(async (context) => {
      const projectDetail = await getProjectDetail(context, projectId);
      const fields = await listCustomFieldValuesForEntity(context, 'project', projectId).catch(
        () => [],
      );
      return { projectDetail, fields };
    });
    detail = loaded.projectDetail;
    customFields = loaded.fields;
  } catch {
    notFound();
  }

  const canReadFinancials =
    (shell?.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      shell?.permissions.has(PERMISSIONS.CONTRACTS_READ)) ??
    false;

  let clients: { id: string; name: string }[] = [];
  try {
    const rows = await withOrgContext((context) => listClientsForOrg(context, {}));
    clients = rows.map((client) => ({ id: client.id, name: client.name }));
  } catch {
    clients = [];
  }

  const showWorkTab = detail.showWorkPackages;

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

  // Tabs follow Progressive Complexity: a capability the organization has not
  // turned on, or that this person cannot see, leaves no empty shelf behind.
  const can = (permission: PermissionKey) => shell?.permissions.has(permission) ?? false;
  const modules = shell?.modules;

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
          <WorkTab detail={detail} />
        </div>
      ) : null}

      <Suspense fallback={<TabPanelSkeleton />}>
        <ProjectTabsShell tabs={tabs}>
        <TabsContent value="overview">
          <OverviewTab
            detail={detail}
            locale={locale}
            canReadFinancials={canReadFinancials}
            canEdit={can(PERMISSIONS.PROJECTS_UPDATE)}
          />
        </TabsContent>

        {canReadFinancials ? (
          <TabsContent value="financials">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectFinancialsPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {showExpensesTab ? (
          <TabsContent value="expenses">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectExpensesPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {showChangesTab ? (
          <TabsContent value="changes">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectChangesPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {showBillingTab ? (
          <TabsContent value="billing">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectBillingPanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {showWorkTab ? (
          <TabsContent value="work">
            <WorkTab detail={detail} />
          </TabsContent>
        ) : null}

        {showTimeTab ? (
          <TabsContent value="time">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectTimePanel projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        {showDocumentsTab ? (
          <TabsContent value="documents">
            <Suspense fallback={<TabPanelSkeleton />}>
              <DocumentsTab projectId={projectId} />
            </Suspense>
          </TabsContent>
        ) : null}

        <TabsContent value="details">
          <DetailsTab
            detail={detail}
            clients={clients}
            baseCurrency={baseCurrency}
            currencySymbol={currencySymbol}
            canManageContract={canManageContract}
            customFields={customFields}
          />
        </TabsContent>
      </ProjectTabsShell>
      </Suspense>
    </div>
  );
}
