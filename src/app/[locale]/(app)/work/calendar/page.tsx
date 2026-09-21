import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { listAccessibleTasks } from '@/modules/tasks';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { TaskWorkSurfaceClient } from '@/modules/tasks/ui/task-work-surface-client';
import { getTaskDetailAction, updateTaskFieldsAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('calendar.pageTitle') };
}

export default async function WorkCalendarPage() {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const t = await getTranslations('tasks');

  const { tasks, today } = await withOrgContext(async (context) => {
    const rawTasks = await listAccessibleTasks(context, { limit: 500 });
    return {
      tasks: await mapTasksToCardDataForOrg(context, rawTasks),
      today: todayInTimeZone(context.organization.timezone),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('calendar.pageTitle')} description={t('calendar.pageDescription')} />

      <TaskWorkSurfaceClient
        tasks={tasks}
        today={today}
        viewMode="calendar"
        getTaskDetail={getTaskDetailAction}
        updateTask={updateTaskFieldsAction}
      />
    </div>
  );
}
