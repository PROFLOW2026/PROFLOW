import { Suspense } from 'react';
import { buildScheduleSummary } from '@/modules/projects';
import { loadProjectDetail } from './load-project-detail';
import {
  loadProjectProgressView,
  schedulePercentForReader,
} from '@/modules/projects/application/project-progress-mode';
import { todayInTimeZone } from '@/shared/dates/dates';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProjectEarlyWarningsFallback, ProjectEarlyWarningsPanel } from './overview-early-warnings';
import { ScheduleSummaryPanel } from './schedule-summary-panel';

/** Schedule + early warnings formerly on the overview tab — now atop money / financials. */
export async function ProjectFinancialsWorkspaceExtras({
  projectId,
}: {
  readonly projectId: string;
}) {
  return withOrgContext(async (context) => {
    const canReadFinancials =
      context.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      context.permissions.has(PERMISSIONS.CONTRACTS_READ);
    if (!canReadFinancials) return null;

    const detail = await loadProjectDetail(projectId, true);
    if (detail.project.workKind === 'job' || detail.project.workKind === 'work_order') return null;

    const organizationTimezone = context.organization.timezone ?? 'Asia/Jerusalem';
    const scheduleBase = buildScheduleSummary({
      project: detail.project,
      workPackages: detail.workPackages,
      milestones: detail.milestones,
      phases: detail.phases,
      today: (() => {
        try {
          return todayInTimeZone(organizationTimezone);
        } catch {
          return todayInTimeZone('Asia/Jerusalem');
        }
      })(),
    });
    const progressView = await loadProjectProgressView(context.db, context.organizationId, projectId);
    const schedule = {
      ...scheduleBase,
      progressPercent: schedulePercentForReader(
        progressView?.source ?? detail.project.progressSource,
        scheduleBase.progressPercent,
        progressView?.displayedPercent ?? null,
      ),
    };

    return (
      <div className="flex min-w-0 flex-col gap-4">
        <Suspense fallback={<ProjectEarlyWarningsFallback />}>
          <ProjectEarlyWarningsPanel projectId={projectId} />
        </Suspense>
        <ScheduleSummaryPanel summary={schedule} projectId={projectId} />
      </div>
    );
  });
}
