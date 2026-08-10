import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import {
  findOriginalValueEvent,
  hasStoredOpeningReduction,
  resolveDisplayOriginalNet,
} from '@/modules/projects';
import { getShellContext } from '@/shared/auth/session';
import { fromNumericString } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { localeDirection } from '@/shared/i18n/config';
import { ArchiveProjectButton } from './archive-project-button';
import { loadProjectDetail } from './load-project-detail';
import { ProjectHeaderMetrics } from './project-header-metrics';
import { ProjectStatusBadge } from '../project-status-badge';
import { resolveProjectTabs, type ProjectTabKey } from './project-tab-order';
import { ProjectTabsShell } from './project-tabs-shell';
import { TabPanelSkeleton } from './tab-panel-skeleton';

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; projectId: string }>;
}

/**
 * Stable project chrome for `?tab=` soft-nav.
 *
 * Layout does not read `searchParams`, so tab switches re-render the page
 * segment only — header, metrics, and tab list stay mounted without re-fetching.
 */
export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { projectId } = await params;
  const shell = await getShellContext();

  const can = (permission: PermissionKey) => shell?.permissions.has(permission) ?? false;
  const modules = shell?.modules;

  const canReadFinancials =
    (shell?.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      shell?.permissions.has(PERMISSIONS.CONTRACTS_READ)) ??
    false;
  const showExpensesTab = can(PERMISSIONS.EXPENSES_READ);
  const showChangesTab = Boolean(modules?.changes) && can(PERMISSIONS.CHANGES_READ);
  const showBillingTab = Boolean(modules?.billing) && can(PERMISSIONS.BILLING_READ);
  // Team is permission-gated (not module) so owners can assign people before
  // the workforce module preference flips on from first create.
  const showTeamTab = can(PERMISSIONS.WORKFORCE_READ);
  const showTimeTab = can(PERMISSIONS.WORKFORCE_READ);
  const showDocumentsTab = Boolean(modules?.documents) && can(PERMISSIONS.DOCUMENTS_READ);

  const [t, tTabs, tStatus, detail, locale] = await Promise.all([
    getTranslations('projects'),
    getTranslations('projects.workspace.tabs'),
    getTranslations('status.project'),
    loadProjectDetail(projectId, false).catch(() => null),
    getLocale(),
  ]);
  if (!detail) notFound();

  // Jobs use `/jobs/[jobId]` — page owns the redirect (preserves `?tab=`).
  // Pass children through without project chrome so we do not flash the wrong shell.
  if (detail.project.workKind === 'job') {
    return <>{children}</>;
  }

  const showWorkTab = detail.showWorkPackages;
  const canArchive = shell?.permissions.has(PERMISSIONS.PROJECTS_ARCHIVE) ?? false;

  const tabs = resolveProjectTabs({
    financials: canReadFinancials,
    expenses: showExpensesTab,
    changes: showChangesTab,
    billing: showBillingTab,
    team: showTeamTab,
    time: showTimeTab,
    documents: showDocumentsTab,
    work: showWorkTab,
  });

  const tabLabels = Object.fromEntries(tabs.map((tab) => [tab, tTabs(tab)])) as Partial<
    Record<ProjectTabKey, string>
  >;
  const dir = localeDirection(locale);

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
                    <Link href={`/clients/${detail.project.clientId}`} prefetch={false} className="hover:underline">
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

      {/*
        Tab list must not sit behind the page Suspense — otherwise open-project
        wall clock waits on overview structure before tabs are selectable.
        Soft-nav still only re-renders `children` (layout ignores searchParams).
      */}
      <ProjectTabsShell
        tabs={tabs}
        labels={tabLabels}
        projectHref={`/projects/${projectId}`}
        dir={dir}
      >
        <Suspense
          fallback={
            <div className="min-w-0 max-w-full">
              <div className="pt-4">
                <TabPanelSkeleton />
              </div>
            </div>
          }
        >
          {children}
        </Suspense>
      </ProjectTabsShell>
    </div>
  );
}
