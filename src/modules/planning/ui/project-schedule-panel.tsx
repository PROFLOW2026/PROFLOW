import 'server-only';
import { getLocale } from 'next-intl/server';
import { findProjectById } from '@/modules/projects';
import { listPlanningPlan } from '../application/list-plan';
import { buildCriticalPathFoundation } from '../domain/critical-path-foundation';
import { PlanningEligibilityError } from '../domain/eligibility';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';
import { PlanningVsTasksContextualInfo } from '@/modules/tasks/ui/planning-vs-tasks-contextual-info';
import { ProjectPlanningPanel } from './project-planning-panel';
import { PlanningWritePanel } from './planning-write-panel';
import { PlanningBaselineSection } from './planning-baseline-section';
import {
  createPlanningWorkItemAction,
  updatePlanningWorkItemAction,
  archivePlanningWorkItemAction,
  setPlanningDependencyAction,
  removePlanningDependencyAction,
  linkPlanningWorkItemTaskAction,
  unlinkPlanningWorkItemTaskAction,
  copyPlanningDatesToLinkedTaskAction,
  copyLinkedTaskDatesToPlanningAction,
} from '@/app/[locale]/(app)/projects/planning-actions';
import type { PlanningLocale } from './messages';

export interface ProjectSchedulePanelProps {
  readonly projectId: string;
}

/**
 * Project → לוח זמנים tab: Gantt + list for classic projects.
 * Jobs stay opt-out (eligibility) - panel shows the opt-out message if reached.
 */
export async function ProjectSchedulePanel({ projectId }: ProjectSchedulePanelProps) {
  const locale = await getLocale();
  const planningLocale = resolveLabelLocale(locale) as PlanningLocale;

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PLANNING_READ)) {
      return null;
    }

    const project = await findProjectById(context.db, context.organizationId, projectId);
    if (!project) return null;

    const canWrite = hasPermission(context, PERMISSIONS.PLANNING_WRITE);
    const canUpdateTasks = hasPermission(context, PERMISSIONS.TASKS_UPDATE);
    const workKind = project.workKind === 'job' ? ('job' as const) : ('project' as const);
    if (workKind === 'job') {
      return {
        workKind,
        canWrite,
        canUpdateTasks,
        workItems: [] as const,
        dependencies: [] as const,
        gantt: null,
        overdue: [] as const,
        criticalPathFoundation: buildCriticalPathFoundation({
          projectId,
          workItems: [],
          dependencies: [],
        }),
      };
    }

    try {
      const view = await listPlanningPlan(
        {
          organizationId: context.organizationId,
          projectId,
          workKind: 'project',
          today: todayInTimeZone(context.organization.timezone),
        },
        { db: context.db },
      );

      return {
        workKind: 'project' as const,
        canWrite,
        canUpdateTasks,
        workItems: view.snapshot.workItems,
        dependencies: view.snapshot.dependencies,
        gantt: view.gantt,
        overdue: view.overdue,
        criticalPathFoundation: view.criticalPathFoundation,
      };
    } catch (error) {
      if (error instanceof PlanningEligibilityError) {
        return {
          workKind: 'job' as const,
          canWrite,
          canUpdateTasks,
          workItems: [] as const,
          dependencies: [] as const,
          gantt: null,
          overdue: [] as const,
          criticalPathFoundation: buildCriticalPathFoundation({
            projectId,
            workItems: [],
            dependencies: [],
          }),
        };
      }
      throw error;
    }
  });

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PlanningVsTasksContextualInfo projectId={projectId} />
      </div>

      <ProjectPlanningPanel
        workKind={data.workKind}
        locale={planningLocale}
        workItems={data.workItems}
        dependencies={data.dependencies}
        gantt={data.gantt}
        overdue={data.overdue}
        criticalPathFoundation={data.criticalPathFoundation}
      />

      {data.workKind === 'project' ? <PlanningBaselineSection projectId={projectId} /> : null}

      {data.canWrite && data.workKind === 'project' ? (
        <PlanningWritePanel
          projectId={projectId}
          workItems={data.workItems}
          dependencies={data.dependencies}
          canUpdateTasks={data.canUpdateTasks}
          canUpdatePlanning={data.canWrite}
          createAction={createPlanningWorkItemAction}
          updateAction={updatePlanningWorkItemAction}
          archiveAction={archivePlanningWorkItemAction}
          setDepAction={setPlanningDependencyAction}
          removeDepAction={removePlanningDependencyAction}
          linkTaskAction={linkPlanningWorkItemTaskAction}
          unlinkTaskAction={unlinkPlanningWorkItemTaskAction}
          copyDatesToTaskAction={copyPlanningDatesToLinkedTaskAction}
          copyDatesToPlanningAction={copyLinkedTaskDatesToPlanningAction}
        />
      ) : null}
    </div>
  );
}
