import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  getTeamWorkload,
  getEmployeeTaskPreview,
} from '@/modules/tasks/application/get-team-workload';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { WorkloadExpandableRows } from './workload-expandable-rows';

export const metadata: Metadata = { title: 'Team Workload' };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface WorkloadPageProps {
  searchParams: Promise<{
    expand?: string; // employee ID to pre-expand
  }>;
}

export default async function WorkloadPage({ searchParams }: WorkloadPageProps) {
  const [params, shell] = await Promise.all([searchParams, getShellContext()]);

  const canRead = shell?.permissions.has(PERMISSIONS.WORKLOAD_READ) ?? false;
  const canAssign = shell?.permissions.has(PERMISSIONS.TASKS_ASSIGN) ?? false;

  if (!canRead) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-6">
        <PageHeader title="Team Workload" />
        <EmptyState
          title="Access restricted"
          description="You need the workload.read permission to view team workload."
        />
      </div>
    );
  }

  // Pre-expand employee task preview if requested via URL param
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
          title="Team Workload"
          description="No active employees found"
        />
        <EmptyState
          title="No active employees"
          description="Add active employees to view team workload."
        />
      </div>
    );
  }

  // Compute summary stats for the header
  const totalOpen = rows.reduce((s, r) => s + r.openTasks, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdueTasks, 0);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title="Team Workload"
        description={`${rows.length} active employee${rows.length === 1 ? '' : 's'} · ${totalOpen} open task${totalOpen === 1 ? '' : 's'} · ${totalOverdue} overdue`}
      />

      {/* Summary KPI chips */}
      <div className="flex flex-wrap gap-3">
        <StatChip label="Active employees" value={rows.length} />
        <StatChip label="Open tasks" value={totalOpen} />
        <StatChip label="Overdue" value={totalOverdue} tone={totalOverdue > 0 ? 'red' : 'neutral'} />
        <StatChip
          label="Due this week"
          value={rows.reduce((s, r) => s + r.dueThisWeek, 0)}
          tone="amber"
        />
      </div>

      {/* Main table + expandable rows (client component handles expand/collapse) */}
      <WorkloadExpandableRows
        rows={rows}
        showEstimatedEffort={showEstimatedEffort}
        canAssign={canAssign}
        initialExpandedId={expandEmployeeId}
        initialPreviewTasks={
          expandEmployeeId
            ? previewTasks.map((t) => ({ ...t, employeeId: expandEmployeeId }))
            : []
        }
      />

      {!showEstimatedEffort && (
        <p className="text-xs text-[var(--pf-text-muted)]">
          Estimated effort is hidden — no tasks have estimated_effort_minutes populated.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat chip (server component)
// ---------------------------------------------------------------------------

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
