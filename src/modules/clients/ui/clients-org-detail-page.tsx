import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getClientById, getClientFinancials, getClientProfitability, getClientTimeline } from '@/modules/clients';
import {
  listClientCrmHistory,
  listClientProjectContracts,
  listClientProjectTasks,
  type ClientCrmHistoryRows,
  type ClientProjectContractItem,
  type ClientProjectTaskRow,
} from '@/modules/clients/application/get-client-card-sections';
import {
  listBusinessCatalog,
  localizeClientTypeOptions,
  localizePaymentTermOptions,
} from '@/modules/business-catalog';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listProjectsForOrg } from '@/modules/projects';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ClientDetailView } from '@/app/[locale]/(app)/clients/[clientId]/client-detail-view';
import { ClientFinancialPanel } from '@/app/[locale]/(app)/clients/[clientId]/client-financial-panel';
import { ClientProfitabilityPanel } from '@/modules/clients/ui/client-profitability-panel';
import {
  ClientContractsPanel,
  ClientCrmHistoryPanel,
  ClientTasksPanel,
} from '@/modules/clients/ui/client-card-panels';
import { RelatedCommunicationsPanel } from '@/modules/communications/ui/related-panel';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';
import { CustomerStatementActions } from '@/modules/reports/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ClientsOrgDetailPageProps {
  readonly clientId: string;
  readonly routeBase: string;
  readonly surface?: OrgListSurface;
  readonly locale: string;
}

export async function ClientsOrgDetailPage({
  clientId,
  routeBase,
  surface = 'owner',
  locale,
}: ClientsOrgDetailPageProps) {
  const [t, tStatus] = await Promise.all([
    getTranslations('clients.detail'),
    getTranslations('status.generic'),
  ]);

  let client;
  let linkedProjects: Array<{
    id: string;
    name: string;
    status: string;
    workKind: string;
  }> = [];
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let documentsPanel: Awaited<ReturnType<typeof getEntityDocumentPanelData>> | null = null;
  let financials: Awaited<ReturnType<typeof getClientFinancials>> | null = null;
  let profitability: Awaited<ReturnType<typeof getClientProfitability>> | null = null;
  let timelineEvents: Awaited<ReturnType<typeof getClientTimeline>>['events'] = [];
  let timelineState: 'ready' | 'error' = 'ready';
  let clientTypes: Array<{ id: string; name: string }> = [];
  let paymentTerms: Array<{ id: string; name: string }> = [];
  let quotes: Array<{ id: string; title: string; status: string }> = [];
  let contracts: ClientProjectContractItem[] = [];
  let projectTasks: ClientProjectTaskRow[] = [];
  let crmHistory: ClientCrmHistoryRows | null = null;
  let showContracts = false;
  let showTasks = false;
  let canManage = false;
  let canCommunicate = false;
  let canReadBilling = false;

  try {
    const loaded = await withOrgContext(async (context) => {
      if (surface === 'employee') {
        await assertEmployeeAppContext(context);
        if (!orgListHasPermission(context, PERMISSIONS.CLIENTS_READ, surface)) {
          throw new Error('forbidden');
        }
      }

      const detail = await getClientById(context, clientId);
      const readBilling = orgListHasPermission(context, PERMISSIONS.BILLING_READ, surface);
      const readQuotes = orgListHasPermission(context, PERMISSIONS.QUOTES_READ, surface);
      const readContracts = orgListHasPermission(context, PERMISSIONS.CONTRACTS_READ, surface);
      const readTasks = orgListHasPermission(context, PERMISSIONS.TASKS_READ, surface);
      const readCrm = orgListHasPermission(context, PERMISSIONS.CRM_READ, surface);
      const readProfitability =
        orgListHasPermission(context, PERMISSIONS.PROJECTS_READ, surface) &&
        orgListHasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ, surface);
      const { listQuotesForOrg } = await import('@/modules/quotes');
      const [fields, panel, projects, clientFinancials, clientProfitability, timeline, clientTypeRows, paymentTermRows, quoteRows] =
        await Promise.all([
          listCustomFieldValuesForEntity(context, 'client', clientId).catch(() => []),
          getEntityDocumentPanelData(context, 'client', clientId),
          listProjectsForOrg(context, { clientId, includeArchived: false }).catch(() => []),
          readBilling ? getClientFinancials(context, clientId) : Promise.resolve(null),
          readProfitability ? getClientProfitability(context, clientId) : Promise.resolve(null),
          getClientTimeline(context, clientId).catch(() => null),
          listBusinessCatalog(context, 'client_type').catch(() => []),
          listBusinessCatalog(context, 'payment_term').catch(() => []),
          readQuotes ? listQuotesForOrg(context, { clientId }).catch(() => []) : Promise.resolve([]),
        ]);

      const projectIds = projects.map((project) => project.id);
      const [clientContracts, clientTasks, clientCrm] = await Promise.all([
        readContracts
          ? listClientProjectContracts(context, projectIds).catch(() => [])
          : Promise.resolve([]),
        readTasks
          ? listClientProjectTasks(context, projectIds).catch(() => [])
          : Promise.resolve([]),
        readCrm ? listClientCrmHistory(context, clientId).catch(() => null) : Promise.resolve(null),
      ]);

      return {
        detail,
        fields,
        panel,
        financials: clientFinancials,
        profitability: clientProfitability,
        timeline,
        clientTypes: clientTypeRows,
        paymentTerms: paymentTermRows,
        quotes: quoteRows,
        contracts: clientContracts,
        tasks: clientTasks,
        crm: clientCrm,
        showContracts: readContracts,
        showTasks: readTasks,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          workKind: project.workKind,
        })),
        canManage: orgListHasPermission(context, PERMISSIONS.CLIENTS_MANAGE, surface),
        canCommunicate: orgListHasPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE, surface),
        canReadBilling: readBilling,
      };
    });

    client = loaded.detail;
    customFields = loaded.fields;
    documentsPanel = loaded.panel;
    linkedProjects = loaded.projects;
    financials = loaded.financials;
    profitability = loaded.profitability;
    clientTypes = localizeClientTypeOptions(loaded.clientTypes, locale);
    paymentTerms = localizePaymentTermOptions(loaded.paymentTerms, locale);
    quotes = loaded.quotes.map((quote) => ({
      id: quote.id,
      title: quote.title,
      status: quote.status,
    }));
    contracts = loaded.contracts;
    projectTasks = loaded.tasks;
    crmHistory = loaded.crm;
    showContracts = loaded.showContracts;
    showTasks = loaded.showTasks;
    canManage = loaded.canManage;
    canCommunicate = loaded.canCommunicate;
    canReadBilling = loaded.canReadBilling;

    if (loaded.timeline) {
      timelineEvents = loaded.timeline.events;
      timelineState = 'ready';
    } else {
      timelineState = 'error';
    }
  } catch {
    notFound();
  }

  const employeeSurface = routeBase.startsWith('/employee');
  const quotesRouteBase = employeeSurface ? '/employee/quotes' : '/quotes';
  const projectsRouteBase = employeeSurface ? '/employee/projects' : undefined;
  const tasksRouteBase = employeeSurface ? '/employee/tasks' : '/tasks';
  const billingRouteBase = employeeSurface ? '/employee/billing' : '/billing';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={client.name}
        description={t('title')}
        meta={
          <StatusBadge
            shape={client.archivedAt || client.status === 'inactive' ? 'archived' : 'active'}
            label={client.archivedAt ? t('archivedBadge') : tStatus(client.status)}
          />
        }
      />
      <ClientDetailView
        client={client}
        customFields={customFields}
        linkedProjects={linkedProjects}
        canManage={canManage}
        timelineEvents={timelineEvents}
        timelineState={timelineState}
        clientTypes={clientTypes}
        paymentTerms={paymentTerms}
        quotes={quotes}
        routeBase={routeBase}
        quotesRouteBase={quotesRouteBase}
        projectsRouteBase={projectsRouteBase}
        surface={surface}
        afterProjects={
          <>
            {showContracts ? (
              <ClientContractsPanel
                contracts={contracts}
                projects={linkedProjects}
                projectsRouteBase={projectsRouteBase}
              />
            ) : null}
            {showTasks ? (
              <ClientTasksPanel
                tasks={projectTasks}
                projects={linkedProjects}
                projectsRouteBase={projectsRouteBase}
                tasksRouteBase={tasksRouteBase}
                locale={locale}
              />
            ) : null}
          </>
        }
        afterSales={crmHistory ? <ClientCrmHistoryPanel history={crmHistory} /> : null}
      />
      {profitability ? (
        <ClientProfitabilityPanel
          snapshot={profitability}
          projectsRouteBase={projectsRouteBase ?? '/projects'}
        />
      ) : null}
      {financials ? (
        <ClientFinancialPanel
          financials={financials}
          locale={locale}
          billingRouteBase={billingRouteBase}
        />
      ) : null}
      {surface === 'owner' && canReadBilling && financials ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-start text-base">{t('customerStatement.title')}</CardTitle>
            <CardDescription className="text-start">{t('customerStatement.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerStatementActions
              clientId={client.id}
              clientName={client.name}
              clientEmail={client.email}
              clientPhone={client.phone}
              canCommunicate={canCommunicate}
            />
          </CardContent>
        </Card>
      ) : null}
      {surface === 'owner' ? (
        <>
          <PrepareMessageLink
            entityType="other"
            clientId={client.id}
            recipientEmail={client.email}
            subject={client.name}
            disabled={!canCommunicate}
          />
          <RelatedCommunicationsPanel clientId={client.id} />
        </>
      ) : null}
      {documentsPanel ? (
        <DocumentAttachments
          ownerType="client"
          ownerId={client.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      ) : null}
    </div>
  );
}
