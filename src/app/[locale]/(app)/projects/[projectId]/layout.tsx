import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { findOriginalValueEvent } from '@/modules/projects/domain/contract-value';
import {
  hasStoredOpeningReduction,
  resolveDisplayOriginalNet,
} from '@/modules/projects/domain/entry-baseline';
import { titleWithDocumentNumber } from '@/modules/tenancy/domain/document-numbers';
import { resolveProjectExperienceProfile } from '@/modules/tenancy/domain/project-profiles';
import { loadProjectDetail, loadProjectCloseoutStatus, loadProjectLayoutIdentity } from './load-project-detail';
import { getShellContextForProject } from '@/shared/auth/session';
import { fromNumericString } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { localeDirection, PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { ArchiveProjectButton } from './archive-project-button';
import { ProjectHeaderMetrics } from './project-header-metrics';
import { ProjectStatusBadge } from '../project-status-badge';
import {
  applyProjectProfileToTabVisibility,
  resolveProjectFilesTabVisible,
} from './project-tab-order';
import {
  resolveProjectHubs,
  type ProjectHubKey,
} from './project-hub-order';
import { loadProjectExecutionNav } from '@/modules/project-workspace/application/load-execution-nav';
import { withOrgContext } from '@/shared/auth/session';
import { DeveloperGcExecutionEntry } from '@/modules/project-workspace/ui/developer-gc-execution-entry';
import { ProjectExecutionNav } from '@/modules/project-workspace/ui/project-execution-nav';
import { ProjectOperationalContextHeader } from '@/modules/project-workspace/ui/project-operational-context-header';
import { ProjectWorkManagementEntry } from '@/modules/project-workspace/ui/project-work-management-entry';
import { ProjectWorkNav } from '@/modules/project-workspace/ui/project-work-nav';
import { ProjectOwnerWorkspaceShell } from './project-owner-workspace-shell';
import { ProjectReportActions } from '@/modules/reports/ui/project-report-actions';
import {
  Project360Summary,
  Project360SummaryFallback,
} from '@/modules/projects/ui/project-360-summary';
import {
  loadConnectedProjectForLayout,
} from '@/modules/connected-projects';
import { ConnectedProjectBanner } from '@/modules/connected-projects/ui';

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; projectId: string }>;
}

/**
 * Stable project chrome for `?tab=` soft-nav.
 *
 * Commercial vs work vs execution chrome is chosen in
 * `ProjectOwnerWorkspaceShell` (client pathname) because this layout does
 * not re-run on sibling route client navigations.
 */
export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { projectId } = await params;
  const shell = await getShellContextForProject(projectId);

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
  const showScheduleTab = can(PERMISSIONS.PLANNING_READ);
  const showTimeTab = can(PERMISSIONS.WORKFORCE_READ);
  const showDocumentsTab = resolveProjectFilesTabVisible(can(PERMISSIONS.DOCUMENTS_READ));
  const showUsageTab = can(PERMISSIONS.MATERIALS_READ) || can(PERMISSIONS.ASSETS_READ);

  const [identity, locale, executionNav, t, tHubs, tStatus, tCloseout, detail, closeoutStatus, connectedProject] =
    await Promise.all([
      loadProjectLayoutIdentity(projectId),
      getLocale(),
      withOrgContext((context) => loadProjectExecutionNav(context, projectId)).catch(() => ({
        showGroup: false,
        links: [],
      })),
      getTranslations('projects'),
      getTranslations('projects.workspace.hubs'),
      getTranslations('status.project'),
      getTranslations('closeout'),
      loadProjectDetail(projectId, false).catch(() => null),
      loadProjectCloseoutStatus(projectId).catch(() => null),
      loadConnectedProjectForLayout(projectId).catch(() => null),
    ]);

  if (!identity || !detail) notFound();

  const businessProfileKey = shell?.businessProfileKey ?? null;
  const dir = localeDirection(locale);

  if (detail.project.workKind === 'job' || detail.project.workKind === 'work_order') {
    return (
      <WithAppClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
        <div className="flex flex-col gap-6">
          <Suspense fallback={<Project360SummaryFallback />}>
            <Project360Summary projectId={projectId} />
          </Suspense>
          {children}
        </div>
      </WithAppClientMessages>
    );
  }

  const closeoutReady = closeoutStatus === 'ready';
  const showWorkTab = detail.showWorkPackages;
  const canArchive = shell?.permissions.has(PERMISSIONS.PROJECTS_ARCHIVE) ?? false;
  const showUwmLinks =
    Boolean(modules?.work_management) && (shell?.permissions.has(PERMISSIONS.TASKS_READ) ?? false);

  const experienceProfile = resolveProjectExperienceProfile({
    stored: detail.project.experienceProfile,
    workKind: detail.project.workKind,
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

  const hubs = resolveProjectHubs(tabVisibility);

  const hubLabels = Object.fromEntries(hubs.map((hub) => [hub, tHubs(hub)])) as Partial<
    Record<ProjectHubKey, string>
  >;
  const executionEntryHref =
    executionNav.links.find((link) => link.key === 'overview')?.href ?? executionNav.links[0]?.href ?? null;

  const projectWorkEntryHref = showUwmLinks ? `/projects/${projectId}/tasks` : null;
  const projectHref = `/projects/${projectId}`;

  const workChrome = (
    <>
      <ProjectOperationalContextHeader
        projectName={identity.name}
        documentNumber={identity.documentNumber ?? ''}
        backToProjectHref={projectHref}
        workspaceKind="work"
      />
      <ProjectWorkNav projectId={projectId} dir={dir} compact />
    </>
  );

  const executionChrome = (
    <>
      <ProjectOperationalContextHeader
        projectName={identity.name}
        documentNumber={identity.documentNumber ?? ''}
        backToProjectHref={projectHref}
        workspaceKind="execution"
      />
      {executionNav.showGroup ? (
        <ProjectExecutionNav links={executionNav.links} dir={dir} compact />
      ) : null}
    </>
  );

  const commercialTop = (
    <>
      <PageHeader
        title={titleWithDocumentNumber(detail.project.name, detail.project.documentNumber ?? '')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectReportActions
              projectId={projectId}
              canStatus={can(PERMISSIONS.PROJECTS_READ)}
              canFinancials={can(PERMISSIONS.PROJECT_FINANCIALS_READ)}
            />
            {canArchive ? (
              <ArchiveProjectButton
                projectId={projectId}
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
              label={
                detail.project.workKind === 'project' && detail.project.status === 'completed'
                  ? tStatus('closed')
                  : tStatus(detail.project.status)
              }
            />
            {closeoutReady ? (
              <ProjectStatusBadge status="active" label={tCloseout('badge.ready')} />
            ) : null}
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {detail.clientName && detail.project.clientId ? (
                t.rich('workspace.clientLinked', {
                  clientLabel: t('details.clientLabel'),
                  clientName: detail.clientName,
                  link: (chunks) => (
                    <Link href={`/clients/${detail.project.clientId}`} prefetch className="hover:underline">
                      {chunks}
                    </Link>
                  ),
                })
              ) : (
                <>
                  {t('workspace.noClient')}
                  {can(PERMISSIONS.PROJECTS_UPDATE) ? (
                    <>
                      {' · '}
                      <Link
                        href={`/projects/${projectId}?tab=details`}
                        prefetch={false}
                        className="underline underline-offset-2"
                      >
                        {t('workspace.completeClient')}
                      </Link>
                    </>
                  ) : null}
                </>
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
              {detail.project.location ? ` · ${detail.project.location}` : null}
            </span>
          </div>
        }
      />

      <ProjectHeaderMetrics
        currentContractValue={canReadFinancials ? detail.currentContractValue : null}
        displayOriginalValue={
          canReadFinancials && detail.contract && hasStoredOpeningReduction(detail.contract)
            ? resolveDisplayOriginalNet(detail.contract)
            : null
        }
        managedOpeningValue={
          canReadFinancials && detail.contract && hasStoredOpeningReduction(detail.contract)
            ? (() => {
                const original = findOriginalValueEvent(detail.contractValueEvents);
                return original
                  ? fromNumericString(original.amount, original.currency)
                  : fromNumericString(detail.contract.originalValueAmount, detail.contract.currency);
              })()
            : null
        }
      />

      {executionNav.showGroup && executionEntryHref ? (
        <DeveloperGcExecutionEntry href={executionEntryHref} />
      ) : null}

      {projectWorkEntryHref ? <ProjectWorkManagementEntry href={projectWorkEntryHref} /> : null}

      {connectedProject ? <ConnectedProjectBanner connected={connectedProject} /> : null}

      <Suspense fallback={<Project360SummaryFallback />}>
        <Project360Summary projectId={projectId} />
      </Suspense>
    </>
  );

  return (
    <WithAppClientMessages extra={PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES}>
      <ProjectOwnerWorkspaceShell
        projectId={projectId}
        dir={dir}
        commercialTop={commercialTop}
        workChrome={workChrome}
        executionChrome={executionChrome}
        tabs={hubs}
        tabLabels={hubLabels}
      >
        {children}
      </ProjectOwnerWorkspaceShell>
    </WithAppClientMessages>
  );
}
