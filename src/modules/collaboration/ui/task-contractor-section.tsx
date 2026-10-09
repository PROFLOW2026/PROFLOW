import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { getTaskContractorPanel } from '../index';
import { EntityDiscussion } from './entity-discussion-impl';
import { InternalTaskCommandForm } from './internal-task-command-form';

export async function TaskContractorSection({ taskId }: { readonly taskId: string }) {
  const loaded = await withOrgContext(async (context) => {
    const panel = await getTaskContractorPanel(context, taskId);
    return { panel, organizationId: context.organizationId };
  });
  const { panel, organizationId } = loaded;
  if (!panel.eligible || !panel.assignment || !panel.projectId) return null;
  const projectId = panel.projectId;

  const [t, format] = await Promise.all([getTranslations('collaboration'), getFormatter()]);
  const assignment = panel.assignment;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('contractorPanel.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t(`taskStatus.${assignment.status}`)}</Badge>
            {assignment.requiresEvidence ? <Badge tone="warning">{t('contractorPanel.evidenceRequired')}</Badge> : null}
            {assignment.vendorName ? (
              <span className="text-[var(--pf-text-secondary)]">{assignment.vendorName}</span>
            ) : null}
          </div>
          {assignment.dueDate ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('contractorPanel.due', { date: assignment.dueDate })}
            </p>
          ) : null}
          {panel.canVerify || panel.canManage ? (
            <WithAppClientMessages extra={['collaboration']}>
              <InternalTaskCommandForm
                taskId={taskId}
                projectId={projectId}
                commands={assignment.availableCommands}
              />
            </WithAppClientMessages>
          ) : null}
          {panel.history.length > 0 ? (
            <ol className="mt-2 flex flex-col gap-2 border-s border-[var(--pf-border-default)] ps-4">
              {panel.history.map((event) => (
                <li key={event.id}>
                  <p className="font-medium">{t(`taskEvent.${event.action}`)}</p>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {format.dateTime(new Date(event.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                    {event.actorName ? ` · ${event.actorName}` : ''}
                  </p>
                  {event.note ? <p className="whitespace-pre-wrap break-words">{event.note}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </CardContent>
      </Card>

      <EntityDiscussion
        organizationId={organizationId}
        projectId={projectId}
        entityType="task"
        entityId={taskId}
        viewer="internal"
      />
    </div>
  );
}
