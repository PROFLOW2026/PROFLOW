import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  getTeamWorkload,
  getEmployeeTaskPreview,
} from '@/modules/tasks/application/get-team-workload';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { WorkloadExpandableRows } from './workload-expandable-rows';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('workload.pageTitle') };
}

interface WorkloadPageProps {
  searchParams: Promise<{
    expand?: string;
  }>;
}

export default async function WorkloadPage({ searchParams }: WorkloadPageProps) {
  const [params, shell, t] = await Promise.all([
    searchParams,
    getShellContext(),
    getTranslations('tasks'),
  ]);

  const canRead = shell?.permissions.has(PERMISSIONS.WORKLOAD_READ) ?? false;
  const canAssign = shell?.permissions.has(PERMISSIONS.TASKS_ASSIGN) ?? false;

  if (!canRead) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-6">
        <PageHeader title={t('workload.pageTitle')} />
        <EmptyState
          title={t('workload.accessDenied.title')}
          description={t('workload.accessDenied.description')}
        />
      </div>
    );
  }

  const expandEmployeeId = params.expand ?? null;

  const { workload, previewTasks } = await withOrgContext(async (context) => {
    const wl = await getTeamWorkload(context);
    const preview =
      expandEmployeeId
        ? await getEmployeeTaskPreview(context, expandEmployeeId)
        : [];
    return { workload: wl, previewTasks: preview };
  });

  const { rows, showEstimatedEffort } = workload;

  if (rows.length === 0) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-6">
        <PageHeader
          title={t('workload.pageTitle')}
          description={t('workload.description.noEmployees')}
        />
        <EmptyState
          title={t('workload.emptyState.title')}
          description={t('workload.emptyState.description')}
        />
      </div>
    );
  }

  const totalOpen = rows.reduce((s, r) => s + r.openTasks, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdueTasks, 0);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('workload.pageTitle')}
        description={t('workload.description.summary', {
          employeeCount: rows.length,
          openCount: totalOpen,
          overdueCount: totalOverdue,
        })}
      />

      <div className="flex flex-wrap gap-3">
        <StatChip label={t('workload.stats.activeEmployees')} value={rows.length} />
        <StatChip label={t('workload.stats.openTasks')} value={totalOpen} />
        <StatChip
          label={t('workload.stats.overdue')}
          value={totalOverdue}
          tone={totalOverdue > 0 ? 'red' : 'neutral'}
        />
        <StatChip
          label={t('workload.stats.dueThisWeek')}
          value={rows.reduce((s, r) => s + r.dueThisWeek, 0)}
          tone="amber"
        />
      </div>

      <WorkloadExpandableRows
        rows={rows}
        showEstimatedEffort={showEstimatedEffort}
        canAssign={canAssign}
        initialExpandedId={expandEmployeeId}
        initialPreviewTasks={
          expandEmployeeId
            ? previewTasks.map((task) => ({ ...task, employeeId: expandEmployeeId }))
            : []
        }
      />

      {!showEstimatedEffort && (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('workload.effortHidden')}</p>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'red' | 'amber';
}) {
  const colorClass =
    tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'amber'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--pf-text-primary)]';

  return (
    <div className="flex flex-col rounded-lg border border-[var(--pf-border)] bg-[var(--pf-bg-surface)] px-4 py-2.5 shadow-sm">
      <span className={`text-xl font-semibold tabular-nums ${colorClass}`}>{value}</span>
      <span className="text-xs text-[var(--pf-text-muted)]">{label}</span>
    </div>
  );
}
