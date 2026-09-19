import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAssignedTasks } from '@/modules/employee-app';
import { listEmployeePmTasks } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { Link } from '@/shared/i18n/navigation';
import { getLocale } from 'next-intl/server';

/** Canonical task status labels for Employee App display. */
const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
};

const PRIORITY_LABELS: Record<string, string> = {
  none: '',
  low: '↓ Low',
  medium: '→ Medium',
  high: '↑ High',
  urgent: '‼ Urgent',
};

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-secondary)]',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-muted)] line-through',
  blocked: 'bg-red-100 text-red-700',
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function EmployeeTasksPage({ searchParams }: PageProps) {
  const t = await getTranslations('employeeApp.lists');
  const locale = await getLocale();
  const { tab } = await searchParams;

  const { punchTasks, pmTasks, hasPmTasksAccess } = await withOrgContext(async (context) => {
    // ── Punch List (Field Items) — existing logic, unchanged ──
    let punchTasks: Array<{ id: string; title: string; status: string; projectId: string | null }> = [];
    if (
      !context.permissions.has(PERMISSIONS.FIELD_OPS_READ) &&
      !context.employeeApp?.grants.has(PERMISSIONS.FIELD_OPS_READ)
    ) {
      try {
        await authorize(context, { permission: PERMISSIONS.SERVICE_READ, scope: 'assigned_only' });
        punchTasks = await listEmployeeAssignedTasks(context);
      } catch {
        // no field_ops or service access — empty list
      }
    } else {
      try {
        await authorize(context, { permission: PERMISSIONS.FIELD_OPS_READ, scope: 'assigned_only' });
        punchTasks = await listEmployeeAssignedTasks(context);
      } catch {
        // no access — empty list
      }
    }

    // ── PM Tasks — new, gated by tasks.read grant ──
    const pmScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    const hasPmTasksAccess = pmScope !== null;
    let pmTasks: Awaited<ReturnType<typeof listEmployeePmTasks>> = [];
    if (hasPmTasksAccess && tab !== 'field-items') {
      pmTasks = await listEmployeePmTasks(context);
    }

    return { punchTasks, pmTasks, hasPmTasksAccess };
  });

  // Determine active tab: default to PM Tasks when employee has access, else field items
  const activeTab = hasPmTasksAccess
    ? (tab === 'field-items' ? 'field-items' : 'pm-tasks')
    : 'field-items';

  return (
    <div className="space-y-4">
      {/* ── Tab navigation (only shown when employee has PM Tasks access) ── */}
      {hasPmTasksAccess && (
        <div className="flex rounded-lg border border-[var(--pf-border)] overflow-hidden text-sm font-medium">
          <Link
            href={`/${locale}/employee/tasks`}
            className={`flex-1 py-2.5 text-center transition-colors ${
              activeTab === 'pm-tasks'
                ? 'bg-[var(--pf-primary)] text-white'
                : 'bg-[var(--pf-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-2)]'
            }`}
          >
            PM Tasks
          </Link>
          <Link
            href={`/${locale}/employee/tasks?tab=field-items`}
            className={`flex-1 py-2.5 text-center transition-colors border-l border-[var(--pf-border)] ${
              activeTab === 'field-items'
                ? 'bg-[var(--pf-primary)] text-white'
                : 'bg-[var(--pf-surface)] text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-2)]'
            }`}
          >
            Field Items
          </Link>
        </div>
      )}

      {/* ── PM Tasks Tab ── */}
      {activeTab === 'pm-tasks' && (
        <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
          {pmTasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/${locale}/employee/tasks/${task.id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--pf-surface-2)] transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium text-sm leading-snug">{task.title}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[task.status] ?? STATUS_COLORS.todo
                      }`}
                    >
                      {STATUS_LABELS[task.status] ?? task.status}
                    </span>
                    {task.priority && task.priority !== 'none' && (
                      <span className="text-xs text-[var(--pf-text-muted)]">
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="text-xs text-[var(--pf-text-muted)]">
                        Due {task.dueDate}
                      </span>
                    )}
                  </div>
                </div>
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--pf-text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </li>
          ))}
          {pmTasks.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[var(--pf-text-secondary)]">
              No PM tasks assigned to you
            </li>
          )}
        </ul>
      )}

      {/* ── Field Items Tab (Punch List — unchanged behavior) ── */}
      {activeTab === 'field-items' && (
        <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
          {punchTasks.map((task) => (
            <li key={task.id} className="px-4 py-3 text-sm">
              <div className="font-medium">{task.title}</div>
              <div className="text-[var(--pf-text-secondary)]">{task.status}</div>
            </li>
          ))}
          {punchTasks.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
              {t('tasksEmpty')}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
