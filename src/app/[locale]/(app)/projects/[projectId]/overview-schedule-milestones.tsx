import { SkeletonText } from '@/components/ui/skeleton';
import { buildScheduleSummary, type MilestoneRecord } from '@/modules/projects';
import {
  loadProjectProgressView,
  schedulePercentForReader,
} from '@/modules/projects/application/project-progress-mode';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates/dates';
import { loadProjectDetail } from './load-project-detail';
import { MilestonesPanel } from './milestones-panel';
import { ScheduleSummaryPanel } from './schedule-summary-panel';

/** Client-bound milestone rows - drop notes, org id, and timestamps from Flight. */
function slimMilestonesForClient(milestones: readonly MilestoneRecord[]) {
  return milestones.map((row) => ({
    id: row.id,
    name: row.name,
    targetDate: row.targetDate,
    status: row.status,
    archivedAt: row.archivedAt,
  }));
}

/**
 * Schedule summary - structure fetch is request-cached with milestones.
 * Overview contract cards stream without waiting on WP/phase/milestone rows.
 */
export async function OverviewSchedulePanel({
  projectId,
  organizationTimezone,
}: {
  projectId: string;
  organizationTimezone: string;
}) {
  const detail = await loadProjectDetail(projectId, true);
  const scheduleBase = buildScheduleSummary({
    project: detail.project,
    workPackages: detail.workPackages,
    milestones: detail.milestones,
    phases: detail.phases,
    today: todayInTimeZone(organizationTimezone),
  });
  const progressView = await withOrgContext((context) =>
    loadProjectProgressView(context.db, context.organizationId, projectId),
  );
  const schedule = {
    ...scheduleBase,
    progressPercent: schedulePercentForReader(
      progressView?.source ?? detail.project.progressSource,
      scheduleBase.progressPercent,
      progressView?.displayedPercent ?? null,
    ),
  };

  return <ScheduleSummaryPanel summary={schedule} projectId={projectId} />;
}

export async function OverviewMilestonesPanel({
  projectId,
  canEdit,
  organizationTimezone,
}: {
  projectId: string;
  canEdit: boolean;
  organizationTimezone: string;
}) {
  const detail = await loadProjectDetail(projectId, true);
  return (
    <MilestonesPanel
      projectId={projectId}
      milestones={slimMilestonesForClient(detail.milestones)}
      canEdit={canEdit}
      today={todayInTimeZone(organizationTimezone)}
    />
  );
}

export function OverviewStructureFallback() {
  return <SkeletonText lines={4} />;
}
