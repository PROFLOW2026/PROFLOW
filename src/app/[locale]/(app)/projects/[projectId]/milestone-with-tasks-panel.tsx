import 'server-only';

/**
 * MilestoneWithTasksPanel — server component wrapper around MilestonesPanel.
 *
 * Fetches project tasks and their milestone links so each milestone card can
 * show its linked task status badge and allow linking.
 *
 * Composition:
 *   OverviewMilestonesPanel (existing, simple)
 *   └─ MilestoneWithTasksPanel (new, richer — used when tasks module is available)
 *      ├─ MilestonesPanel (existing client component)
 *      └─ per-milestone: MilestoneLinkedTask (new client component)
 */

// eslint-disable-next-line no-restricted-imports
import { and, eq } from 'drizzle-orm';
// eslint-disable-next-line no-restricted-imports
import { tasks } from '@drizzle/schema';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveListLimit, ORG_LIST_HARD_CAP } from '@/shared/db/list-limits';
import type { MilestoneRecord } from '@/modules/projects';
import { todayInTimeZone } from '@/shared/dates/dates';
import { loadProjectDetail } from './load-project-detail';
import { MilestonesPanel } from './milestones-panel';
import { MilestoneLinkedTask, type LinkedTaskSummary, type ProjectTaskOption } from './milestone-linked-task';
import { linkTaskToMilestoneAction } from './milestone-link-actions';

function slimMilestoneForClient(row: MilestoneRecord) {
  return {
    id: row.id,
    name: row.name,
    targetDate: row.targetDate,
    status: row.status,
    archivedAt: row.archivedAt,
  };
}

export async function MilestoneWithTasksPanel({
  projectId,
  canEdit,
  organizationTimezone,
}: {
  projectId: string;
  canEdit: boolean;
  organizationTimezone: string;
}) {
  const today = todayInTimeZone(organizationTimezone);

  const data = await withOrgContext(async (context) => {
    const canReadTasks = hasPermission(context, PERMISSIONS.TASKS_READ);
    const detail = await loadProjectDetail(projectId, true);
    const milestones = detail.milestones.filter((m) => !m.archivedAt);

    let projectTasks: ProjectTaskOption[] = [];
    const linkedTaskByMilestone: Map<string, LinkedTaskSummary> = new Map();

    if (canReadTasks) {
      const taskRows = await context.db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          dueDate: tasks.dueDate,
          milestoneId: tasks.milestoneId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, context.organizationId),
            eq(tasks.projectId, projectId),
            eq(tasks.isArchived, false),
          ),
        )
        .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }))
        .catch(() => []);

      projectTasks = taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      }));

      // Build linked-task lookup keyed by milestoneId
      for (const t of taskRows) {
        if (t.milestoneId) {
          linkedTaskByMilestone.set(t.milestoneId, {
            id: t.id,
            title: t.title,
            status: t.status,
            dueDate: t.dueDate ?? null,
          });
        }
      }
    }

    return {
      milestones: milestones.map(slimMilestoneForClient),
      projectTasks,
      linkedTaskByMilestone,
      canReadTasks,
    };
  });

  if (!data) return null;

  return (
    <div className="space-y-0">
      <MilestonesPanel
        projectId={projectId}
        milestones={data.milestones}
        canEdit={canEdit}
        today={today}
        linkedTaskSlot={(milestoneId) =>
          data.canReadTasks ? (
            <MilestoneLinkedTask
              milestoneId={milestoneId}
              projectId={projectId}
              linkedTask={data.linkedTaskByMilestone.get(milestoneId) ?? null}
              projectTasks={data.projectTasks}
              canEdit={canEdit}
              linkAction={linkTaskToMilestoneAction}
            />
          ) : null
        }
      />
    </div>
  );
}
