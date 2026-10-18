import type { Metadata } from 'next';
import { Bell, CalendarDays, ChevronRight, FileText, FolderKanban, ListChecks } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getEmployeeShellData } from '@/modules/employee-app/application/get-employee-shell';
import {
  getEmployeePmTaskWorkSummary,
  listEmployeePmTasks,
} from '@/modules/employee-app/application/employee-pm-tasks';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { addDays, todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { listDueReminderTaskIds } from '@/modules/employee-app/application/employee-task-attention';
import { EmployeeInstallButton } from '@/modules/employee-app/ui/employee-install-button';
import { EmployeeEmptyState } from '@/modules/employee-app/ui/employee-empty-state';
import {
  employeeBadgeAccentClass,
  employeeBadgeDangerClass,
  employeeBadgeNeutralClass,
  employeeBadgeWarningClass,
  employeeIconMdClass,
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePageStackClass,
  employeePageSubtitleClass,
  employeePageTitleClass,
  employeePanelClass,
  employeeQuickLinkClass,
  employeeSectionTitleClass,
  employeeStatCardAccentClass,
  employeeStatCardClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { getEmployeeAvatarAvailability } from '@/modules/identity-images';
import { EmployeeAvatarPanel } from '@/modules/identity-images/client';
import { cn } from '@/shared/ui/cn';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp' });
  return { title: t('title') };
}

const CLOSED_STATUSES = new Set(['done', 'cancelled']);

type HomeTaskKind = 'overdue' | 'dueToday' | 'reminder' | 'upcoming' | 'blocked';

function badgeClassForKind(kind: HomeTaskKind): string {
  if (kind === 'overdue' || kind === 'blocked') return employeeBadgeDangerClass;
  if (kind === 'dueToday') return employeeBadgeAccentClass;
  if (kind === 'reminder') return employeeBadgeWarningClass;
  return employeeBadgeNeutralClass;
}

export default async function EmployeeHomePage() {
  const t = await getTranslations('employeeApp');
  const locale = await getLocale();
  const { data, taskSummary, priorityTasks, avatarAvailability } = await withOrgContext(async (context) => {
    const shell = await getEmployeeShellData(context);
    const hasTasks = employeeHasPermission(context, PERMISSIONS.TASKS_READ);

    let summary = null;
    let tasks: Array<{
      id: string;
      title: string;
      dueDate: string | null;
      status: string;
      projectLabel: string | null;
      kind: HomeTaskKind;
    }> = [];

    if (hasTasks) {
      summary = await getEmployeePmTaskWorkSummary(context);
      const today = todayInTimeZone(context.organization.timezone);
      const upcomingUntil = addDays(today, 7);
      const rows = await listEmployeePmTasks(context);
      const openRows = rows.filter((row) => !CLOSED_STATUSES.has(row.status));
      const reminderTaskIds = await listDueReminderTaskIds(
        context,
        openRows.map((row) => row.id),
      );
      const projectLabels = await loadProjectDisplayNameMap(
        context.db,
        context.organizationId,
        openRows.map((row) => row.projectId).filter(Boolean) as string[],
      );

      tasks = openRows
        .map((row) => {
          let kind: HomeTaskKind | null = null;
          if (row.dueDate && row.dueDate < today) kind = 'overdue';
          else if (row.dueDate === today) kind = 'dueToday';
          else if (reminderTaskIds.has(row.id)) kind = 'reminder';
          else if (row.status === 'blocked') kind = 'blocked';
          else if (row.dueDate && row.dueDate > today && row.dueDate <= upcomingUntil) {
            kind = 'upcoming';
          }
          if (!kind) return null;
          return {
            id: row.id,
            title: row.title,
            dueDate: row.dueDate,
            status: row.status,
            projectLabel: row.projectId ? (projectLabels.get(row.projectId) ?? null) : null,
            kind,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => {
          const order: Record<HomeTaskKind, number> = {
            overdue: 0,
            dueToday: 1,
            reminder: 2,
            blocked: 3,
            upcoming: 4,
          };
          const rankDiff = order[a.kind] - order[b.kind];
          if (rankDiff !== 0) return rankDiff;
          return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
        })
        .slice(0, 8);
    }

    const avatarAvailability = shell.employeeId
      ? await getEmployeeAvatarAvailability(context)
      : { schemaReady: false, storageConfigured: false };

    return {
      data: shell,
      taskSummary: summary,
      priorityTasks: tasks,
      avatarAvailability,
    };
  });

  const canProjects = data.nav.some((item) => item.visible && item.href === '/employee/projects');
  const canDocuments = data.nav.some((item) => item.visible && item.href === '/employee/documents');
  const canNotifications = data.nav.some(
    (item) => item.visible && item.href === '/employee/notifications',
  );

  return (
    <div className={employeePageStackClass}>
      <header className="relative w-full overflow-hidden rounded-2xl border border-[var(--pf-teal-200)] bg-[linear-gradient(135deg,var(--pf-teal-50)_0%,color-mix(in_srgb,var(--pf-teal-50)_78%,var(--pf-bg-surface))_55%,color-mix(in_srgb,var(--pf-teal-100)_55%,var(--pf-bg-surface))_100%)] px-5 py-6 shadow-[var(--pf-shadow-sm)] md:px-6 md:py-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 100% 0%, var(--pf-teal-200), transparent 65%)',
          }}
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pf-accent)]">
            {t('title')}
          </p>
          <h1 className={cn(employeePageTitleClass, 'mt-1')}>
            {t('greeting', { name: data.employeeName || t('home.anonymousName') })}
          </h1>
          <p className={employeePageSubtitleClass}>{t('home.workSummary.subtitle')}</p>
        </div>
      </header>

      {data.employeeId ? (
        <section className={employeePanelClass}>
          <EmployeeAvatarPanel
            employeeId={data.employeeId}
            employeeName={data.employeeName || t('home.anonymousName')}
            previewUrl={data.avatarUrl}
            canEdit
            schemaReady={avatarAvailability.schemaReady}
            storageConfigured={avatarAvailability.storageConfigured}
          />
        </section>
      ) : null}

      {taskSummary ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className={employeeSectionTitleClass}>{t('home.workSummary.title')}</h2>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/employee/tasks"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--pf-text-primary)] shadow-sm hover:bg-[var(--pf-bg-subtle)]"
              >
                <ListChecks className={employeeIconMdClass} aria-hidden />
                {t('home.workSummary.openList')}
              </Link>
              <Link
                href="/employee/tasks/calendar"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--pf-text-primary)] shadow-sm hover:bg-[var(--pf-bg-subtle)]"
              >
                <CalendarDays className={employeeIconMdClass} aria-hidden />
                {t('home.workSummary.openCalendar')}
              </Link>
              {canProjects ? (
                <Link
                  href="/employee/projects"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--pf-text-primary)] shadow-sm hover:bg-[var(--pf-bg-subtle)]"
                >
                  <FolderKanban className={employeeIconMdClass} aria-hidden />
                  {t('home.workSummary.openProjects')}
                </Link>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-2">
            <Link href="/employee/tasks" className={employeeStatCardClass}>
              <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">
                {t('home.workSummary.dueToday')}
              </dt>
              <dd className="mt-1.5 text-3xl font-bold tracking-tight text-[var(--pf-text-primary)]">
                {taskSummary.dueToday}
              </dd>
            </Link>
            <Link
              href="/employee/tasks"
              className={cn(
                taskSummary.overdue > 0 ? employeeStatCardAccentClass : employeeStatCardClass,
              )}
            >
              <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">
                {t('home.workSummary.overdue')}
              </dt>
              <dd
                className={cn(
                  'mt-1.5 text-3xl font-bold tracking-tight',
                  taskSummary.overdue > 0
                    ? 'text-[var(--pf-status-danger-fg)]'
                    : 'text-[var(--pf-text-primary)]',
                )}
              >
                {taskSummary.overdue}
              </dd>
            </Link>
          </dl>

          {priorityTasks.length > 0 ? (
            <div className={employeePanelClass}>
              <h3 className="mb-3 text-sm font-semibold text-[var(--pf-text-primary)]">
                {t('home.workSummary.priorityHeading')}
              </h3>
              <ul className={employeeListPanelClass}>
                {priorityTasks.map((task) => (
                  <li key={task.id}>
                    <Link href={`/employee/tasks/${task.id}`} className={employeeListRowLinkClass}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold leading-snug text-[var(--pf-text-primary)]">
                            {task.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--pf-text-secondary)]">
                            {task.projectLabel ? <span className="truncate">{task.projectLabel}</span> : null}
                            {task.dueDate ? (
                              <span>
                                {t('home.workSummary.dueDateLabel', {
                                  date: new Intl.DateTimeFormat(locale, {
                                    dateStyle: 'medium',
                                    timeZone: 'UTC',
                                  }).format(new Date(`${task.dueDate}T00:00:00.000Z`)),
                                })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className={cn('shrink-0', badgeClassForKind(task.kind))}>
                          {t(`home.workSummary.badges.${task.kind}`)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/employee/tasks"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--pf-accent)] hover:underline"
              >
                {t('home.workSummary.viewTasks')}
                <ChevronRight className={rtlFlipClassName('size-4')} aria-hidden />
              </Link>
            </div>
          ) : (
            <EmployeeEmptyState
              title={t('home.workSummary.emptyTitle')}
              description={t('home.workSummary.emptyDescription')}
              icon={ListChecks}
              action={
                <Link
                  href="/employee/tasks"
                  className="text-sm font-semibold text-[var(--pf-accent)] hover:underline"
                >
                  {t('home.workSummary.viewTasks')}
                </Link>
              }
            />
          )}
        </section>
      ) : null}

      {canDocuments || canNotifications ? (
        <section className="space-y-3">
          <h2 className={employeeSectionTitleClass}>{t('home.secondaryLinksTitle')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {canDocuments ? (
              <Link href="/employee/documents" className={employeeQuickLinkClass}>
                <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]">
                  <FileText className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--pf-text-primary)]">
                  {t('home.workSummary.openDocuments')}
                </span>
                <ChevronRight className={rtlFlipClassName('size-4 text-[var(--pf-text-muted)]')} aria-hidden />
              </Link>
            ) : null}
            {canNotifications ? (
              <Link href="/employee/notifications" className={employeeQuickLinkClass}>
                <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]">
                  <Bell className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--pf-text-primary)]">
                  {t('home.workSummary.openNotifications')}
                </span>
                <ChevronRight className={rtlFlipClassName('size-4 text-[var(--pf-text-muted)]')} aria-hidden />
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <EmployeeInstallButton />
    </div>
  );
}
