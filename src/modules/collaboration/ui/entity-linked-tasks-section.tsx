import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { loadProjectCapabilities } from '@/modules/project-team/application/capability-guard';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { listTasksLinkedFrom } from '@/modules/collaboration';
import { CreateLinkedTaskForm } from './create-linked-task-form';

export async function EntityLinkedTasksSection({
  projectId,
  entityType,
  entityId,
  defaultTaskTitle,
}: {
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly defaultTaskTitle: string;
}) {
  const loaded = await withOrgContext(async (context) => {
    const held = await loadProjectCapabilities(context, projectId);
    const canCreate = held.has(PROJECT_CAPABILITIES.TASKS_MANAGE);
    const tasks = await listTasksLinkedFrom(context.db, context.organizationId, entityType, entityId);
    return { canCreate, tasks };
  });

  if (loaded.tasks.length === 0 && !loaded.canCreate) return null;

  const t = await getTranslations('collaboration.linkedTasks');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loaded.tasks.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {loaded.tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.id}`} className="font-medium text-[var(--pf-status-info-fg)] underline">
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {loaded.canCreate ? (
          <CreateLinkedTaskForm
            projectId={projectId}
            entityType={entityType}
            entityId={entityId}
            defaultTitle={defaultTaskTitle}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
