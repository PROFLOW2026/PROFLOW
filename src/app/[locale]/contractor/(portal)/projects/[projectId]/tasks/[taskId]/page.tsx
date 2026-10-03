import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { getContractorPortalTask } from '@/modules/collaboration';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { ContractorTaskCommandForm } from '@/modules/collaboration/ui/contractor-task-command-form';
import { requireExternalContext } from '@/modules/contractor-access';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorTaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const [t, format] = await Promise.all([getTranslations('collaboration'), getFormatter()]);
  const context = await requireExternalContext();
  const organizationId = context.grants.find((g) => g.projectId === projectId || g.projectId === null)?.organizationId;
  if (!organizationId) {
    return null;
  }

  const detail = await loadOrNotFound(() =>
    getContractorPortalTask(context, { organizationId, taskId }),
  );
  const { task } = detail;
  const basePath = `/contractor/projects/${projectId}/tasks`;

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader
        breadcrumb={
          <Link href={basePath} className="text-sm text-[var(--pf-text-brand)] hover:underline">
            {t('portal.tasks.back')}
          </Link>
        }
        title={task.title}
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge tone={task.overdue ? 'danger' : 'neutral'}>{t(`taskStatus.${task.status}`)}</Badge>
            {task.requiresEvidence ? <Badge tone="warning">{t('contractorPanel.evidenceRequired')}</Badge> : null}
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          {task.description ? <p className="whitespace-pre-wrap break-words">{task.description}</p> : null}
          {task.dueDate ? <p className="text-xs text-[var(--pf-text-secondary)]">{t('contractorPanel.due', { date: task.dueDate })}</p> : null}
          {task.locationName ? <p className="text-xs text-[var(--pf-text-secondary)]">{task.locationName}</p> : null}
        </CardContent>
      </Card>

      {task.canAct && task.availableCommands.length > 0 ? (
        <WithClientMessages extra={['collaboration']}>
          <ContractorTaskCommandForm
            organizationId={organizationId}
            projectId={projectId}
            taskId={taskId}
            commands={task.availableCommands}
          />
        </WithClientMessages>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('portal.tasks.evidence')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <EvidenceGallery organizationId={organizationId} entityType="task" entityId={taskId} viewer="external" />
          {task.status !== 'closed' && task.status !== 'cancelled' && task.status !== 'approved' ? (
            <EvidenceUploader
              organizationId={organizationId}
              projectId={projectId}
              entityType="task"
              entityId={taskId}
              viewer="external"
              accept={['photo', 'video', 'document']}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('portal.tasks.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 border-s border-[var(--pf-border-default)] ps-4">
            {detail.history.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="font-medium">{t(`taskEvent.${event.action}`)}</p>
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {format.dateTime(new Date(event.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                {event.note ? <p className="whitespace-pre-wrap break-words">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <EntityDiscussion
        organizationId={organizationId}
        projectId={projectId}
        entityType="task"
        entityId={taskId}
        viewer="external"
      />
    </div>
  );
}
