import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { planningWorkItems } from '@drizzle/schema';
import { listTaskEntityLinks } from '@/modules/collaboration';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import { findTaskById } from '../data/tasks.repository';
import { hrefForRelatedEntity } from '../domain/task-related-work-href';
import { resolveRelatedEntityLabel } from './resolve-related-entity-labels';

export interface TaskRelatedWorkEntry {
  readonly id: string;
  readonly kind: 'entity_link' | 'planning_schedule';
  readonly entityType: string;
  readonly label: string;
  readonly href: string;
  readonly relation: string | null;
}

export async function listTaskRelatedWork(
  context: OrgContext,
  taskId: string,
): Promise<TaskRelatedWorkEntry[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const projectId = task.projectId;

  const [links, planningRows] = await Promise.all([
    listTaskEntityLinks(context.db, context.organizationId, taskId),
    context.db
      .select({ id: planningWorkItems.id, name: planningWorkItems.name, projectId: planningWorkItems.projectId })
      .from(planningWorkItems)
      .where(
        and(
          eq(planningWorkItems.organizationId, context.organizationId),
          eq(planningWorkItems.taskId, taskId),
          isNull(planningWorkItems.archivedAt),
        ),
      )
      .limit(20),
  ]);

  const entries: TaskRelatedWorkEntry[] = [];

  for (const link of links) {
    const resolved = await resolveRelatedEntityLabel(
      context.db,
      context.organizationId,
      link.entityType,
      link.entityId,
      projectId,
    );
    const href = hrefForRelatedEntity(link.entityType, link.entityId, resolved.projectId);
    if (!href) continue;
    entries.push({
      id: link.id,
      kind: 'entity_link',
      entityType: link.entityType,
      label: resolved.label,
      href,
      relation: link.relation,
    });
  }

  for (const row of planningRows) {
    const href = hrefForRelatedEntity('planning_work_item', row.id, row.projectId);
    if (!href) continue;
    entries.push({
      id: `planning:${row.id}`,
      kind: 'planning_schedule',
      entityType: 'planning_work_item',
      label: row.name,
      href,
      relation: 'schedule_link',
    });
  }

  return entries;
}
