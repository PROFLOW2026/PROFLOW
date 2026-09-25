import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { getEmployeePmTaskDetail, getEmployeePmTaskCapabilities, listEmployeePmTaskAssigneeOptions, listEmployeePmTaskPendingApprovals } from '@/modules/employee-app/application/employee-pm-tasks';
import { loadProjectDisplayNameMap } from '@/modules/projects/application/project-display-names';
import { todayInTimeZone } from '@/shared/dates';
import { EmployeePostponeMenu } from '@/modules/employee-app/ui/employee-postpone-menu';
import {
  employeeFilterInputClass,
  employeeListPanelClass,
  employeePanelClass,
  employeePrimaryButtonClass,
  employeeSectionTitleClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import {
  assigneeDisplaysForTask,
  loadTaskAssigneeDisplayMap,
} from '@/modules/tasks/application/enrich-task-assignees';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { sumReportedHoursForTask } from '@/modules/workforce';
import { Link } from '@/shared/i18n/navigation';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { NotFoundError } from '@/shared/errors';
import {
  employeeUpdateTaskStatusAction,
  employeeToggleChecklistItemAction,
  employeeAddTaskCommentAction,
  employeeAssignTaskAction,
  employeeDecideTaskApprovalAction,
} from '../actions';
import {
  CommentFormClient,
  CommentAttachmentsGallery,
} from '@/modules/tasks/ui/task-comments-client';
import { TaskActivity } from '@/modules/tasks/ui/task-activity';
import { getEmployeeTaskDocumentPanelData } from '@/modules/employee-app/application/employee-task-documents';
import { EmployeeTaskDocumentAttachments } from '@/modules/employee-app/ui/employee-task-document-attachments';
import { cn } from '@/shared/ui/cn';

const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'blocked',
  'cancelled',
] as const;

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-secondary)]',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-muted)]',
  blocked: 'bg-red-100 text-red-700',
};

const PRIORITY_BADGES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

interface PageProps {
  params: Promise<{ taskId: string; locale: string }>;
}

export default async function EmployeePmTaskDetailPage({ params }: PageProps) {
  const { taskId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('employeeApp.tasks');

  let task: Awaited<ReturnType<typeof getEmployeePmTaskDetail>>;
  let canUpdate = false;
  let canComment = false;
  let canAssign = false;
  let canApprove = false;
  let assigneeOptions: Awaited<ReturnType<typeof listEmployeePmTaskAssigneeOptions>> = [];
  let pendingApprovals: Awaited<ReturnType<typeof listEmployeePmTaskPendingApprovals>> = [];
  let assigneeNames = '';
  let projectDisplayName: string | null = null;
  let today = '';
  let reportedHours = '0';
  let canLogTime = false;
  let documentsPanel: Awaited<ReturnType<typeof getEmployeeTaskDocumentPanelData>> | null = null;
  try {
    const result = await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      const detail = await getEmployeePmTaskDetail(context, taskId);
      const capabilities = await getEmployeePmTaskCapabilities(context, detail);
      const [assignees, approvals, assigneeMap, projectLabels, hoursTotal] = await Promise.all([
        capabilities.canAssign
          ? listEmployeePmTaskAssigneeOptions(context, detail.projectId)
          : Promise.resolve([]),
        capabilities.canApprove
          ? listEmployeePmTaskPendingApprovals(context, taskId)
          : Promise.resolve([]),
        loadTaskAssigneeDisplayMap(context.db, context.organizationId, [taskId]),
        detail.projectId
          ? loadProjectDisplayNameMap(context.db, context.organizationId, [detail.projectId])
          : Promise.resolve(new Map<string, string>()),
        sumReportedHoursForTask(context.db, context.organizationId, taskId),
      ]);
      const assigneeLabels = assigneeDisplaysForTask(taskId, assigneeMap)
        .map((assignee) => assignee.displayName)
        .filter(Boolean)
        .join(', ');
      return {
        task: detail,
        canUpdate: capabilities.canUpdate,
        canComment: capabilities.canComment,
        canAssign: capabilities.canAssign,
        canApprove: capabilities.canApprove,
        assigneeOptions: assignees,
        pendingApprovals: approvals,
        assigneeNames: assigneeLabels,
        projectDisplayName: detail.projectId ? (projectLabels.get(detail.projectId) ?? null) : null,
        today: todayInTimeZone(context.organization.timezone),
        canCreate: employeeHasPermission(context, PERMISSIONS.TASKS_CREATE),
        reportedHours: hoursTotal,
        canLogTime: employeeHasPermission(context, PERMISSIONS.TIME_MANAGE),
        documentsPanel: await getEmployeeTaskDocumentPanelData(context, taskId).catch(() => null),
      };
    });
    task = result.task;
    canUpdate = result.canUpdate;
    canComment = result.canComment;
    canAssign = result.canAssign;
    canApprove = result.canApprove;
    assigneeOptions = result.assigneeOptions;
    pendingApprovals = result.pendingApprovals;
    assigneeNames = result.assigneeNames;
    projectDisplayName = result.projectDisplayName;
    today = result.today;
    reportedHours = result.reportedHours;
    canLogTime = result.canLogTime;
    documentsPanel = result.documentsPanel;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo;
  return (
    <div className="space-y-5 pb-8">
      <div className={cn(employeePanelClass, 'space-y-3')}>
        <h1 className="text-base font-semibold leading-snug">{task.title}</h1>
        {projectDisplayName ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{projectDisplayName}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', statusColor)}>
            {t(`status.${task.status}`, { defaultValue: task.status })}
          </span>
          {task.priority && task.priority !== 'none' ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                PRIORITY_BADGES[task.priority] ?? '',
              )}
            >
              {t(`priority.${task.priority}`, { defaultValue: task.priority })}
            </span>
          ) : null}
          {task.dueDate ? (
            <span className="inline-flex items-center rounded-full bg-[var(--pf-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--pf-text-secondary)]">
              {t('dueDate', { date: task.dueDate })}
            </span>
          ) : null}
          {canUpdate ? (
            <EmployeePostponeMenu taskId={taskId} dueDate={task.dueDate} today={today} />
          ) : null}
        </div>
        {task.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--pf-text-secondary)]">
            {task.description}
          </p>
        ) : null}
        {assigneeNames ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('assigneesLabel', { defaultValue: 'Assignees' })}: {assigneeNames}
          </p>
        ) : null}
      </div>

      <section className={cn(employeePanelClass, 'space-y-2')}>
        <h2 className={employeeSectionTitleClass}>{t('reportedTimeLabel')}</h2>
        <p className="text-sm text-[var(--pf-text-primary)]">
          {t('reportedTimeHours', {
            hours: Number(reportedHours).toLocaleString(locale, { maximumFractionDigits: 2 }),
          })}
        </p>
        {canLogTime && task.projectId ? (
          <Link
            href={`/employee/hours/new?projectId=${task.projectId}&taskId=${taskId}`}
            className={cn(employeePrimaryButtonClass, 'inline-flex w-full justify-center sm:w-auto')}
          >
            {t('reportTimeForTask')}
          </Link>
        ) : null}
      </section>

      {canAssign && assigneeOptions.length > 0 ? (
        <section className="space-y-2">
          <h2 className={cn('px-1', employeeSectionTitleClass)}>
            {t('assignSection')}
          </h2>
          <form action={employeeAssignTaskAction.bind(null, taskId)} className="flex flex-col gap-2 sm:flex-row">
            <select
              name="assigneeEmployeeId"
              required
              className={cn(employeeFilterInputClass, 'min-h-[44px] flex-1')}
            >
              <option value="">{t('assignSelect')}</option>
              {assigneeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <button type="submit" className={employeePrimaryButtonClass}>
              {t('assignSubmit')}
            </button>
          </form>
        </section>
      ) : canAssign ? (
        <p className="px-1 text-xs text-[var(--pf-text-secondary)]">{t('assignEmpty')}</p>
      ) : null}

      {canApprove && pendingApprovals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('approveSection')}
          </h2>
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="space-y-2 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-4"
            >
              <p className="text-xs text-[var(--pf-text-muted)]">
                {new Date(approval.createdAt).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <form action={employeeDecideTaskApprovalAction.bind(null, taskId)} className="space-y-2">
                <input type="hidden" name="requestId" value={approval.id} />
                <textarea
                  name="decisionNote"
                  rows={2}
                  placeholder={t('approveNotePlaceholder')}
                  className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    name="decision"
                    value="approved"
                    className="min-h-[44px] rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    {t('approveAction')}
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="rejected"
                    className="min-h-[44px] rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                  >
                    {t('rejectAction')}
                  </button>
                </div>
              </form>
            </div>
          ))}
        </section>
      ) : canApprove ? (
        <p className="px-1 text-xs text-[var(--pf-text-secondary)]">{t('approveEmpty')}</p>
      ) : null}

      {canUpdate ? (
        <section className={cn(employeePanelClass, 'space-y-3')}>
          <h2 className={employeeSectionTitleClass}>{t('updateStatus')}</h2>
          <div className="flex flex-wrap gap-2">
            {TASK_STATUSES.map((status) => {
              const isActive = status === task.status;
              const updateWithStatus = updateEmployeeTaskStatus.bind(null, taskId, status);
              return (
                <form key={status} action={updateWithStatus}>
                  <button
                    type="submit"
                    disabled={isActive}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      isActive
                        ? 'cursor-default border-[var(--pf-action-primary)] bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]'
                        : 'border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-primary)] hover:bg-[var(--pf-bg-subtle)]',
                    )}
                  >
                    {t(`status.${status}`, { defaultValue: status })}
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}

      {task.checklistItems.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('checklistTitle', {
              done: task.checklistItems.filter((item) => item.isDone).length,
              total: task.checklistItems.length,
            })}
          </h2>
          <ul className={employeeListPanelClass}>
            {task.checklistItems.map((item) => {
              if (!canUpdate) {
                return (
                  <li key={item.id} className="flex min-h-[52px] items-center gap-3 px-4 py-3">
                    <ChecklistMark done={item.isDone} />
                    <span className={cn('flex-1 text-sm', item.isDone && 'line-through text-[var(--pf-text-muted)]')}>
                      {item.title}
                    </span>
                  </li>
                );
              }
              const toggleAction = toggleChecklistItem.bind(null, taskId, item.id, !item.isDone);
              return (
                <li key={item.id} className="min-h-[52px]">
                  <form action={toggleAction}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--pf-surface-2)] active:bg-[var(--pf-surface-3)]"
                    >
                      <ChecklistMark done={item.isDone} />
                      <span className={cn('flex-1 text-sm', item.isDone && 'line-through text-[var(--pf-text-muted)]')}>
                        {item.title}
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {documentsPanel?.canRead ? (
        <EmployeeTaskDocumentAttachments
          taskId={taskId}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
          canClassifyCompensation={documentsPanel.canClassifyCompensation}
          projectId={documentsPanel.projectId}
          canBrowseCloudFiles={documentsPanel.canBrowseCloudFiles}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
          {t('commentsTitle')}
        </h2>
        {task.comments.length > 0 ? (
          <ul className="space-y-2">
            {task.comments.map((comment) => (
              <li
                key={comment.id}
                className={cn(employeePanelClass, 'space-y-2 !p-4')}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-[var(--pf-text-primary)]">
                    {comment.authorDisplayName ?? t('commentAuthorSystem')}
                  </p>
                  <p className="text-xs text-[var(--pf-text-muted)]">
                    {new Date(comment.createdAt).toLocaleString(locale, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                    {comment.isEdited ? ` · ${t('commentEdited')}` : null}
                  </p>
                </div>
                {comment.body ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--pf-text-primary)]">
                    {comment.body}
                  </p>
                ) : null}
                <CommentAttachmentsGallery attachments={comment.attachments} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-sm text-[var(--pf-text-muted)]">{t('noComments')}</p>
        )}
        {canComment ? (
          <CommentFormClient
            taskId={taskId}
            action={employeeAddTaskCommentAction}
            placeholderText={t('commentPlaceholder')}
            submitLabel={t('postComment')}
            className={cn(employeePanelClass, 'space-y-3 !p-4')}
            textareaClassName={cn(employeeFilterInputClass, 'min-h-[88px] resize-none')}
            submitClassName={cn(employeePrimaryButtonClass, 'w-full sm:w-auto')}
          />
        ) : null}
      </section>

      <section className={employeePanelClass}>
        <TaskActivity taskId={taskId} />
      </section>
    </div>
  );
}

function ChecklistMark({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs',
        done ? 'border-green-500 bg-green-500 text-white' : 'border-[var(--pf-border)] bg-[var(--pf-surface)]',
      )}
    >
      {done ? '✓' : null}
    </span>
  );
}

async function updateEmployeeTaskStatus(taskId: string, newStatus: string) {
  'use server';
  await employeeUpdateTaskStatusAction(taskId, newStatus);
}

async function toggleChecklistItem(taskId: string, itemId: string, isDone: boolean) {
  'use server';
  await employeeToggleChecklistItemAction(taskId, itemId, isDone);
}

