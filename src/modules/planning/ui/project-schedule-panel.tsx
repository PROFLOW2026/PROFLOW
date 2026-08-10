import { and, eq } from 'drizzle-orm';
import { getLocale } from 'next-intl/server';
import { projects } from '@drizzle/schema';
import { listPlanningPlan } from '../application/list-plan';
import { buildCriticalPathFoundation } from '../domain/critical-path-foundation';
import { PlanningEligibilityError } from '../domain/eligibility';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProjectPlanningPanel } from './project-planning-panel';
import type { PlanningLocale } from './messages';

export interface ProjectSchedulePanelProps {
  readonly projectId: string;
}

/**
 * Project → לוח זמנים tab: Gantt + list for classic projects.
 * Jobs stay opt-out (eligibility) — panel shows the opt-out message if reached.
 */
export async function ProjectSchedulePanel({ projectId }: ProjectSchedulePanelProps) {
  const locale = await getLocale();
  const planningLocale: PlanningLocale = locale === 'he-IL' ? 'he-IL' : 'en';

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PLANNING_READ)) {
      return null;
    }

    const [row] = await context.db
      .select({ workKind: projects.workKind })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
      .limit(1);

    if (!row) return null;

    const workKind = row.workKind === 'job' ? ('job' as const) : ('project' as const);
    if (workKind === 'job') {
      return {
        workKind,
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
    <ProjectPlanningPanel
      workKind={data.workKind}
      locale={planningLocale}
      workItems={data.workItems}
      dependencies={data.dependencies}
      gantt={data.gantt}
      overdue={data.overdue}
      criticalPathFoundation={data.criticalPathFoundation}
    />
  );
}
