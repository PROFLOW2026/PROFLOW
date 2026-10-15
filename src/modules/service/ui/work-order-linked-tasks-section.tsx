import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEntityLinkedTasks } from '@/modules/tasks/application/list-entity-linked-tasks';
import { listLinkableProjectTasks } from '@/modules/tasks/application/list-linkable-project-tasks';
import { BusinessLinkTaskForm } from '@/modules/tasks/ui/business-link-task-form';
import { linkWorkOrderTaskAction } from '@/app/[locale]/(app)/work-orders/[id]/work-order-task-link-actions';

export async function WorkOrderLinkedTasksSection({
  workOrderId,
  canLink,
}: {
  readonly workOrderId: string;
  readonly canLink: boolean;
}) {
  const t = await getTranslations('service');

  const { linked, linkable } = await withOrgContext(async (context) => {
    const linkedRows = await listEntityLinkedTasks(context, 'project', workOrderId);
    const options = canLink
      ? await listLinkableProjectTasks(context, workOrderId, {
          entityType: 'project',
          entityId: workOrderId,
        }).catch(() => [])
      : [];
    return { linked: linkedRows, linkable: options };
  });

  if (linked.length === 0 && !canLink) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('linkedTasks.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {linked.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {linked.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks/${task.id}`}
                  className="font-medium text-[var(--pf-status-info-fg)] underline"
                >
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('linkedTasks.empty')}</p>
        )}
        {canLink ? (
          <BusinessLinkTaskForm
            taskOptions={linkable}
            hiddenFields={{ workOrderId }}
            linkAction={linkWorkOrderTaskAction}
            labelsNamespace="service"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
