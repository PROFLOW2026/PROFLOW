import 'server-only';

import { listProjectContractorTasks } from '@/modules/collaboration';
import { listProjectCoordinationEvents } from '@/modules/coordination';
import { countProjectDefects } from '@/modules/defects';
import { countProjectInspections } from '@/modules/inspections';
import { PROJECT_CAPABILITIES as C, loadProjectCapabilities } from '@/modules/project-team';
import { countOverdueRfis } from '@/modules/rfi';
import { countSubmittalsByStatus } from '@/modules/submittals/data/submittals.repository';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { AuthorizationError } from '@/shared/errors';
import {
  buildExecutionDashboardMetrics,
  coordinationDashboardCounts,
  overdueContractorTaskCount,
  pendingSubmittalReviewCount,
  type ExecutionDashboardMetrics,
} from '../domain/execution-dashboard-metrics';
import { canReadWith } from '@/modules/coordination/application/authorization';

export async function loadProjectExecutionDashboard(
  context: OrgContext,
  projectId: string,
): Promise<ExecutionDashboardMetrics> {
  const held = await loadProjectCapabilities(context, projectId);
  const today = todayInTimeZone(context.organization.timezone);
  const now = new Date();

  const coordinationPromise = canReadWith(held)
    ? listProjectCoordinationEvents(context, projectId, { scope: 'open', limit: 300 })
        .then((page) => coordinationDashboardCounts(page.items, now))
        .catch((error) => {
          if (error instanceof AuthorizationError) return null;
          throw error;
        })
    : Promise.resolve(null);

  const tasksPromise = held.has(C.TASKS_VIEW)
    ? listProjectContractorTasks(context, { projectId, openOnly: true, limit: 200 }).then((tasks) =>
        overdueContractorTaskCount(tasks, today),
      )
    : Promise.resolve(null);

  const defectsPromise = held.has(C.PROJECT_VIEW)
    ? countProjectDefects(context, projectId).catch(() => null)
    : Promise.resolve(null);

  const rfiPromise = held.has(C.PROJECT_VIEW)
    ? countOverdueRfis(context.db, {
        organizationId: context.organizationId,
        today,
        projectIds: [projectId],
      })
    : Promise.resolve(null);

  const submittalsPromise = held.has(C.PROJECT_VIEW)
    ? countSubmittalsByStatus(context.db, { organizationId: context.organizationId, projectId }).then((counts) =>
        pendingSubmittalReviewCount(counts),
      )
    : Promise.resolve(null);

  const inspectionsPromise = held.has(C.PROJECT_VIEW)
    ? countProjectInspections(context, projectId).then((counts) => counts.open)
    : Promise.resolve(null);

  const [coordination, overdueTasks, defectCounts, overdueRfis, pendingSubmittals, openInspections] = await Promise.all([
    coordinationPromise,
    tasksPromise,
    defectsPromise,
    rfiPromise,
    submittalsPromise,
    inspectionsPromise,
  ]);

  return buildExecutionDashboardMetrics({
    coordination,
    overdueTasks,
    defectCounts,
    overdueRfis,
    pendingSubmittals,
    openInspections,
  });
}
