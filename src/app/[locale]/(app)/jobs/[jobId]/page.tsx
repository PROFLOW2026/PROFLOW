import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import {
  canConvertJobToProject,
  getProjectDetail,
  isOpenPriceJob,
  selectProjectWorkspaceLinks,
} from '@/modules/projects';
import { titleWithDocumentNumber } from '@/modules/tenancy';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { Link, redirect } from '@/shared/i18n/navigation';
import { localeDirection } from '@/shared/i18n/config';
import { ProjectBillingPanel } from '@/modules/billing/ui';
import { ProjectBudgetPanel } from '@/modules/budgets/ui';
import { ProjectExpensesPanel } from '@/modules/expenses/ui';
import { ProjectFinancialsPanel } from '@/modules/financials/ui';
import { ProjectTeamPanel, ProjectTimePanel } from '@/modules/workforce/ui';
import { ProjectUsagePanel } from '@/modules/assets/ui';
import { ArchiveProjectButton } from '../../projects/[projectId]/archive-project-button';
import { DetailsTab } from '../../projects/[projectId]/details-tab';
import { DocumentsTab } from '../../projects/[projectId]/documents-tab';
import { OverviewTab } from '../../projects/[projectId]/overview-tab';
import { ProjectHeaderMetrics } from '../../projects/[projectId]/project-header-metrics';
import { ProjectTabsShell, type ProjectTabKey } from '../../projects/[projectId]/project-tabs-shell';
import { TabPanelSkeleton } from '../../projects/[projectId]/tab-panel-skeleton';
import { ProjectStatusBadge } from '../../projects/project-status-badge';
import { resolveJobTabs } from '../job-tab-order';
import { ConvertJobButton } from './convert-job-button';
import { JobOpenPricePanel } from './job-open-price-panel';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { ProjectFormsPanel } from '@/modules/forms/ui';
import { BoqMeasureEntryLink } from '@/modules/boq/ui/boq-measure-entry-link';

interface JobPageProps {
  params: Promise<{ locale: string; jobId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

const MODULE_PANEL_TABS = new Set<ProjectTabKey>([
  'financials',
  'expenses',
  'billing',
  'budgets',
  'team',
  'usage',
  'time',
  'documents',
]);

function tabFromSearchParams(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? 'overview';
  return raw ?? 'overview';
}

const loadJobDetail = cache(async (jobId: string, includeStructure: boolean) =>
  withOrgContext((context) => getProjectDetail(context, jobId, { includeStructure })),
);

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { locale, jobId } = await params;
  const t = await getTranslations({ locale, namespace: 'jobs' });
  try {
    const detail = await loadJobDetail(jobId, false);
    return { title: detail.project.name };
  } catch {
    return { title: t('workspace.fallbackTitle') };
  }
}

export default async function JobPage({ params, searchParams }: JobPageProps) {
  const [{ locale, jobId }, search, shell] = await Promise.all([
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
  const showBillingTab = Boolean(modules?.billing) && can(PERMISSIONS.BILLING_READ);
  // Team is permission-gated (not module) — parity with projects.
  const showTeamTab = can(PERMISSIONS.WORKFORCE_READ);
  const showTimeTab = Boolean(modules?.workforce) && can(PERMISSIONS.WORKFORCE_READ);
  const showDocumentsTab = Boolean(modules?.documents) && can(PERMISSIONS.DOCUMENTS_READ);
  const showBudgetsTab = Boolean(modules?.budgets) && can(PERMISSIONS.BUDGETS_READ);
  const showUsageTab = can(PERMISSIONS.MATERIALS_READ) || can(PERMISSIONS.ASSETS_READ);

  const visibleModuleTabs = new Set<string>();
  if (canReadFinancials) visibleModuleTabs.add('financials');
  if (showExpensesTab) visibleModuleTabs.add('expenses');
  if (showBillingTab) visibleModuleTabs.add('billing');
  if (showBudgetsTab) visibleModuleTabs.add('budgets');
  if (showTeamTab) visibleModuleTabs.add('team');
  if (showUsageTab) visibleModuleTabs.add('usage');
  if (showTimeTab) visibleModuleTabs.add('time');
  if (showDocumentsTab) visibleModuleTabs.add('documents');

  const includeStructure = !(
    MODULE_PANEL_TABS.has(tabParam as ProjectTabKey) && visibleModuleTabs.has(tabParam)
  );

  const [t, tJobs, tStatus, tTabs, detail, resolvedLocale] = await Promise.all([
    getTranslations('projects'),
    getTranslations('jobs'),
    getTranslations('status.project'),
    getTranslations('projects.workspace.tabs'),
    loadJobDetail(jobId, includeStructure).catch(() => null),
    getLocale(),
  ]);
  if (!detail) notFound();

  if (detail.project.workKind !== 'job') {
    redirect({ href: `/projects/${jobId}`, locale });
  }

  const openPrice = isOpenPriceJob(detail.project);
  const canReadContracts = can(PERMISSIONS.CONTRACTS_READ);
  // When contracts.read is missing, detail.contract is null — don't false-disable
  // fixed jobs; convertJobToProject still enforces managed revenue on the server.
  const convertAllowed = openPrice
    ? false
    : canReadContracts
      ? canConvertJobToProject({
          workKind: detail.project.workKind,
          pricingMode: detail.project.pricingMode,
          hasPrimaryContract: Boolean(detail.contract),
          hasManagedOriginalNet: Boolean(detail.contract?.originalValueAmount),
          hasOriginalValueEvent: detail.contractValueEvents.some(
            (event) => event.kind === 'original',
          ),
        })
      : detail.project.pricingMode === 'fixed';
  const workspaceLinks = selectProjectWorkspaceLinks({
    projectId: jobId,
    modules: modules ?? {},
    permissions: shell?.permissions ?? new Set(),
    showWorkPackages: false,
    canReadFinancials,
  })
    // Jobs keep financial/ops shortcuts; drop schedule chrome (dates live on overview).
    .filter((link) => link.key !== 'schedule' && link.key !== 'work')
    .map((link) =>
      link.inProject
        ? {
            ...link,
            href: link.href.replace(`/projects/${jobId}`, `/jobs/${jobId}`),
          }
        : link,
    );

  const canArchive = shell?.permissions.has(PERMISSIONS.PROJECTS_ARCHIVE) ?? false;
  const canManageContract = shell?.permissions.has(PERMISSIONS.CONTRACTS_MANAGE) ?? false;
  const canEditProjects = can(PERMISSIONS.PROJECTS_UPDATE);
  const baseCurrency =
    detail.contract?.currency ??
    detail.project.currency ??
    shell?.organization.baseCurrency ??
    'ILS';
  const sample = formatMoney(zeroMoney(baseCurrency), locale, {
    currencyDisplay: 'narrowSymbol',
  });
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

  const tabs: ProjectTabKey[] = resolveJobTabs({
    expenses: showExpensesTab,
    team: showTeamTab,
    time: showTimeTab,
    billing: showBillingTab,
    documents: showDocumentsTab,
    financials: canReadFinancials,
    budgets: showBudgetsTab,
    usage: showUsageTab,
  });

  const activeTab: ProjectTabKey = tabs.includes(tabParam as ProjectTabKey)
    ? (tabParam as ProjectTabKey)
    : (tabs[0] ?? 'overview');

  const tabLabels = Object.fromEntries(tabs.map((tab) => [tab, tTabs(tab)])) as Partial<
    Record<ProjectTabKey, string>
  >;
  const dir = localeDirection(resolvedLocale);

  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let clients: {
    id: string;
    name: string;
    contacts: { id: string; name: string; phone: string | null; role: string }[];
  }[] = [];

  if (activeTab === 'details') {
    const extras = await withOrgContext(async (context) => {
      const [fields, clientRows] = await Promise.all([
        listCustomFieldValuesForEntity(context, 'project', jobId).catch(() => []),
        listClientsForOrg(context, {}).catch(() => []),
      ]);
      const contacts = await listContactsForClients(
        context,
        clientRows.map((client) => client.id),
      ).catch(() => []);
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
        clients: clientRows.map((client) => ({
          id: client.id,
          name: client.name,
          contacts: contactsByClient.get(client.id) ?? [],
        })),
      };
    });
    customFields = extras.fields;
    clients = extras.clients;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.project.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEditProjects ? (
              <ConvertJobButton
                jobId={jobId}
                canConvert={convertAllowed}
                blockedReason={tJobs('convert.requiresRevenueBasis')}
              />
            ) : null}
            {canArchive ? (
              <ArchiveProjectButton
                projectId={jobId}
                status={detail.project.status}
                archivedAt={detail.project.archivedAt}
              />
            ) : null}
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge
              status={detail.project.status}
              label={tStatus(detail.project.status)}
            />
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {detail.clientName && detail.project.clientId ? (
                t.rich('workspace.clientLinked', {
                  clientLabel: t('details.clientLabel'),
                  clientName: detail.clientName,
                  link: (chunks) => (
                    <Link href={`/clients/${detail.project.clientId}`} className={textNavLinkClassName}>
                      {chunks}
                    </Link>
                  ),
                })
              ) : (
                t('workspace.noClient')
              )}
              {detail.clientContact ? (
                <>
                  {' · '}
                  {t('workspace.contactPerson', { name: detail.clientContact.name })}
                  {detail.clientContact.phone
                    ? t('workspace.contactPersonPhone', { phone: detail.clientContact.phone })
                    : null}
                </>
              ) : null}
              {detail.project.startDate ? ` · ${detail.project.startDate}` : null}
            </span>
          </div>
        }
      />

      {openPrice ? (
        <JobOpenPricePanel
          jobId={jobId}
          baseCurrency={baseCurrency}
          currencySymbol={currencySymbol}
          canManage={canManageContract && canEditProjects}
        />
      ) : (
        <ProjectHeaderMetrics
          currentContractValue={canReadFinancials ? detail.currentContractValue : null}
        />
      )}

      <ProjectTabsShell
        tabs={tabs}
        activeTab={activeTab}
        labels={tabLabels}
        projectHref={`/jobs/${jobId}`}
        dir={dir}
      >
        {activeTab === 'overview' ? (
          <div className="pt-4">
            <div className="flex flex-col gap-4">
              {Boolean(modules?.forms) &&
              (shell?.permissions.has(PERMISSIONS.FORMS_READ) ?? false) ? (
                <Suspense fallback={<TabPanelSkeleton />}>
                  <ProjectFormsPanel ownerType="job" ownerId={jobId} />
                </Suspense>
              ) : null}
              {Boolean(modules?.boq) ? (
                <Suspense fallback={null}>
                  <BoqMeasureEntryLink projectId={jobId} />
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

        {activeTab === 'expenses' && showExpensesTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectExpensesPanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'team' && showTeamTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectTeamPanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'usage' && showUsageTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectUsagePanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'time' && showTimeTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectTimePanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'billing' && showBillingTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectBillingPanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'documents' && showDocumentsTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <DocumentsTab projectId={jobId} hasContract={Boolean(detail.contract)} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'financials' && canReadFinancials ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              {/* Always mount real KPIs: open-price shows priceNotSet; costs still visible. */}
              <ProjectFinancialsPanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'budgets' && showBudgetsTab ? (
          <div className="pt-4">
            <Suspense fallback={<TabPanelSkeleton />}>
              <ProjectBudgetPanel projectId={jobId} />
            </Suspense>
          </div>
        ) : null}

        {activeTab === 'details' ? (
          <div className="pt-4">
            <DetailsTab
              detail={detail}
              clients={clients}
              baseCurrency={baseCurrency}
              currencySymbol={currencySymbol}
              canManageContract={canManageContract && !openPrice}
              customFields={customFields}
              showOpeningReduction={false}
              customFieldsRevalidatePath={`/jobs/${jobId}`}
              amountLabel={tJobs('pricing.priceLabel')}
              amountDescription={tJobs('pricing.priceHint')}
              amountPlaceholder={tJobs('pricing.pricePlaceholder')}
              taxModeDescription={tJobs('pricing.taxModeHint')}
            />
          </div>
        ) : null}
      </ProjectTabsShell>
    </div>
  );
}
