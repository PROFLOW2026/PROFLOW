import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { loadConnectedProjectForLayout, visibleDeveloperWorkflowTabs } from '@/modules/connected-projects';
import { DeveloperWorkflowNav } from '@/modules/connected-projects/ui';
import { Link } from '@/shared/i18n/navigation';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ConnectedDeveloperWorkflowLayout({ children, params }: LayoutProps) {
  const { projectId } = await params;
  const connected = await loadConnectedProjectForLayout(projectId);
  if (!connected) notFound();

  const tabs = visibleDeveloperWorkflowTabs(connected.capabilities);
  const t = await getTranslations('projects.connectedDeveloper');

  return (
    <div className="flex min-w-0 flex-col gap-4 pt-2">
      <PageHeader
        title={t('shell.title')}
        description={t('shell.description')}
        meta={
          <Link
            href={`/projects/${projectId}`}
            prefetch
            className="text-sm text-[var(--pf-text-brand)] underline underline-offset-2"
          >
            {t('shell.backToProject')}
          </Link>
        }
      />
      {!connected.externalContext || !connected.coveringGrant ? (
        <p className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-surface-subtle)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('shell.portalRequired')}
        </p>
      ) : tabs.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('shell.noTabs')}</p>
      ) : (
        <DeveloperWorkflowNav contractorProjectId={projectId} tabs={tabs} />
      )}
      {children}
    </div>
  );
}
