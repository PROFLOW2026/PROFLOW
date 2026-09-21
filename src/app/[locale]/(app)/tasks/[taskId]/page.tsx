import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getTaskDetail } from '@/modules/tasks';
import { TaskComments } from '@/modules/tasks/ui/task-comments';
import { TaskActivity, TaskActivitySkeleton } from '@/modules/tasks/ui/task-activity';
import { TaskApprovalGate, TaskApprovalGateSkeleton } from '@/modules/tasks/ui/task-approval-gate';
import { getTaskDetailAction, updateTaskFieldsAction, getTaskDocumentPanelAction } from '../../work/actions';
import { TaskDocumentAttachments } from '@/modules/tasks/ui/task-document-attachments';
import { TaskDetailPageClient } from './_task-detail-page-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}): Promise<Metadata> {
  const { locale, taskId } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });

  try {
    const detail = await withOrgContext(async (context) => getTaskDetail(context, taskId));
    return { title: detail.title };
  } catch {
    return { title: t('task') };
  }
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { taskId } = await params;
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const t = await getTranslations('tasks');

  const { detail, today, documentsPanel } = await withOrgContext(async (context) => ({
    detail: await getTaskDetailAction(taskId),
    today: todayInTimeZone(context.organization.timezone),
    documentsPanel: await getTaskDocumentPanelAction(taskId),
  }));
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={detail.title}
        description={detail.projectName ?? undefined}
        actions={
          <Link href="/work" className={cn(textNavLinkClassName, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
            {t('myWork.pageTitle')}
          </Link>
        }
      />

      <TaskDetailPageClient
        initialTask={detail}
        onUpdate={updateTaskFieldsAction}
        getTaskDetail={getTaskDetailAction}
        today={today}
      />

      <TaskDocumentAttachments
        taskId={taskId}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
        canClassifyCompensation={documentsPanel.canClassifyCompensation}
      />

      {detail.approvalRequired ? (
        <Suspense fallback={<TaskApprovalGateSkeleton />}>
          <TaskApprovalGate taskId={taskId} approvalRequired={detail.approvalRequired} />
        </Suspense>
      ) : null}

      <Suspense fallback={<Skeleton className="h-40 w-full rounded-lg" />}>
        <TaskComments taskId={taskId} />
      </Suspense>

      <Suspense fallback={<TaskActivitySkeleton />}>
        <TaskActivity taskId={taskId} />
      </Suspense>
    </div>
  );
}
