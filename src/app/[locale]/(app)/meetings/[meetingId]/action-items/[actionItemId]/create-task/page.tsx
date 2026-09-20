import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getMeetingDetailById } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { CreateTaskFromActionItemForm } from '../../../../create-task-form';
import { loadMeetingPickerData } from '../../../../load-form-data';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string; actionItemId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.form.createTaskTitle') };
}

export default async function CreateTaskFromActionItemPage({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string; actionItemId: string }>;
}) {
  const shell = await getShellContext();
  if (
    !shell?.permissions.has(PERMISSIONS.MEETINGS_MANAGE) ||
    !shell.permissions.has(PERMISSIONS.TASKS_CREATE)
  ) {
    notFound();
  }

  const { meetingId, actionItemId } = await params;
  const t = await getTranslations('tasks');

  const { meeting, projects, workspaces } = await withOrgContext(async (context) => {
    const detail = await getMeetingDetailById(context, meetingId);
    const pickers = await loadMeetingPickerData(context);
    return { meeting: detail, ...pickers };
  });
  const actionItem = meeting.actionItems.find((row) => row.id === actionItemId);
  if (!actionItem || actionItem.taskId || actionItem.status !== 'open') notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('meetings.form.createTaskTitle')}
        description={t('meetings.form.createTaskDescription')}
        breadcrumb={
          <Link href={`/meetings/${meetingId}`} className={textNavLinkMutedClassName}>
            {meeting.title}
          </Link>
        }
      />

      {workspaces.length === 0 ? (
        <EmptyState
          title={t('meetings.form.noWorkspacesTitle')}
          description={t('meetings.form.noWorkspacesDescription')}
        />
      ) : (
        <CreateTaskFromActionItemForm
          meetingId={meetingId}
          actionItem={actionItem}
          workspaces={workspaces}
          projects={projects}
          defaultWorkspaceId={meeting.workspaceId}
          defaultProjectId={meeting.projectId}
        />
      )}
    </div>
  );
}
