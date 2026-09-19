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
import { ProjectPlanningPanel } from './project-planning-panel';
import { PlanningWritePanel } from './planning-write-panel';
import {
  createPlanningWorkItemAction,
  updatePlanningWorkItemAction,
  archivePlanningWorkItemAction,
  setPlanningDependencyAction,
  removePlanningDependencyAction,
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
    const workKind = project.workKind === 'job' ? ('job' as const) : ('project' as const);
    if (workKind === 'job') {
      return {
        workKind,
        canWrite,
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
      <ProjectPlanningPanel
        workKind={data.workKind}
        locale={planningLocale}
        workItems={data.workItems}
        dependencies={data.dependencies}
        gantt={data.gantt}
        overdue={data.overdue}
        criticalPathFoundation={data.criticalPathFoundation}
      />

      {data.canWrite && data.workKind === 'project' ? (
        <PlanningWritePanel
          projectId={projectId}
          workItems={data.workItems}
          dependencies={data.dependencies}
          createAction={createPlanningWorkItemAction}
          updateAction={updatePlanningWorkItemAction}
          archiveAction={archivePlanningWorkItemAction}
          setDepAction={setPlanningDependencyAction}
          removeDepAction={removePlanningDependencyAction}
        />
      ) : null}
    </div>
  );
}
