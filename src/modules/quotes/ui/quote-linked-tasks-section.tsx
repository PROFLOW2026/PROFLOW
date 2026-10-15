import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listEntityLinkedTasks } from '@/modules/tasks/application/list-entity-linked-tasks';
import { listLinkableProjectTasks } from '@/modules/tasks/application/list-linkable-project-tasks';
import { BusinessLinkTaskForm } from '@/modules/tasks/ui/business-link-task-form';
import { linkQuoteTaskAction } from '@/app/[locale]/(app)/quotes/[quoteId]/quote-task-link-actions';

export async function QuoteLinkedTasksSection({
  quoteId,
  projectId,
  canManage,
}: {
  readonly quoteId: string;
  readonly projectId: string | null;
  readonly canManage: boolean;
}) {
  const { tasks, linkable } = await withOrgContext(async (context) => {
    const linked = await listEntityLinkedTasks(context, 'quote', quoteId);
    const options =
      canManage && projectId
        ? await listLinkableProjectTasks(context, projectId, {
            entityType: 'quote',
            entityId: quoteId,
          }).catch(() => [])
        : [];
    return { tasks: linked, linkable: options };
  });
  const t = await getTranslations('quotes');

  if (tasks.length === 0 && !canManage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('linkedTasks.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tasks.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.id}`} className="font-medium text-[var(--pf-status-info-fg)] underline">
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('linkedTasks.empty')}</p>
        )}
        {canManage && projectId ? (
          <BusinessLinkTaskForm
            taskOptions={linkable}
            hiddenFields={{ quoteId }}
            linkAction={linkQuoteTaskAction}
            labelsNamespace="quotes"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
