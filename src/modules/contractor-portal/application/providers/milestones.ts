import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { projectMilestones } from '@drizzle/schema';
import { MILESTONE_STATUSES, type MilestoneStatus } from '@/modules/projects/domain/types';
import { EXTERNAL_CAPABILITIES as CAP, hasExternalScope, type ExternalContext } from '@/shared/external';
import { portalHref } from '../../domain/routes';
import type {
  PortalProjectTarget,
  PortalSectionItem,
  PortalSectionProvider,
  PortalSectionScope,
} from '../../domain/sections';
import { portalToday, targetsByOrganization } from './shared';

/** Schedule sections are visible with project view or schedule view. */
const MILESTONE_CAPABILITY = { anyOf: [CAP.PROJECT_VIEW, CAP.SCHEDULE_VIEW] } as const;

interface MilestoneRow {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly targetDate: string | null;
  readonly status: string;
  readonly sortOrder: number;
}

function canSeeMilestones(context: ExternalContext, target: PortalProjectTarget): boolean {
  return target.vendorIds.some((vendorId) =>
    context.grants.some((grant) => {
      if (grant.organizationId !== target.organizationId || grant.vendorId !== vendorId) return false;
      if (grant.projectId && grant.projectId !== target.projectId) return false;
      // Project milestones are project-wide. An agreement-scoped grant still covers them;
      // passing that agreement id lets hasExternalScope match the narrowed grant.
      const scope = {
        organizationId: target.organizationId,
        projectId: target.projectId,
        vendorId,
        subcontractAgreementId: grant.subcontractAgreementId,
      };
      return (
        hasExternalScope(context, scope, CAP.PROJECT_VIEW) || hasExternalScope(context, scope, CAP.SCHEDULE_VIEW)
      );
    }),
  );
}

function knownStatus(status: string): MilestoneStatus | null {
  return (MILESTONE_STATUSES as readonly string[]).includes(status) ? (status as MilestoneStatus) : null;
}

function needsAttention(row: MilestoneRow, today: string): boolean {
  if (row.status === 'missed') return true;
  return row.status === 'planned' && row.targetDate != null && row.targetDate < today;
}

function milestoneTone(row: MilestoneRow, today: string): PortalSectionItem['tone'] {
  if (needsAttention(row, today)) return 'danger';
  if (row.status === 'achieved') return 'success';
  return 'neutral';
}

/** Real `project_milestones` rows for the portal scope. RLS on `context.db` is the access boundary. */
async function loadMilestones(context: ExternalContext, scope: PortalSectionScope): Promise<MilestoneRow[]> {
  const rows: MilestoneRow[] = [];
  for (const [organizationId, targets] of targetsByOrganization(scope.targets)) {
    const projectIds = [
      ...new Set(targets.filter((target) => canSeeMilestones(context, target)).map((target) => target.projectId)),
    ];
    if (projectIds.length === 0) continue;
    const selected = await context.db
      .select({
        id: projectMilestones.id,
        projectId: projectMilestones.projectId,
        name: projectMilestones.name,
        targetDate: projectMilestones.targetDate,
        status: projectMilestones.status,
        sortOrder: projectMilestones.sortOrder,
      })
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.organizationId, organizationId),
          inArray(projectMilestones.projectId, projectIds),
          isNull(projectMilestones.archivedAt),
        ),
      )
      .orderBy(asc(projectMilestones.sortOrder), asc(projectMilestones.targetDate));
    rows.push(...selected);
  }
  return rows.sort((a, b) => {
    const byDate = (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31');
    if (byDate !== 0) return byDate;
    return a.sortOrder - b.sortOrder;
  });
}

export const milestonesProvider: PortalSectionProvider = {
  id: 'projects.milestones',
  section: 'milestones',
  capability: MILESTONE_CAPABILITY,
  async load(context, scope) {
    const today = portalToday(scope);
    const rows = await loadMilestones(context, scope);
    const items = rows.map<PortalSectionItem>((row) => {
      const status = knownStatus(row.status);
      return {
        id: row.id,
        projectId: row.projectId,
        title: row.name,
        dueAt: row.targetDate,
        statusKey: status ? `projects.details.milestoneStatuses.${status}` : null,
        tone: milestoneTone(row, today),
        href: portalHref('project.schedule', { projectId: row.projectId }),
      };
    });
    return {
      count: items.length,
      attentionCount: rows.filter((row) => needsAttention(row, today)).length,
      items: items.slice(0, scope.limit),
    };
  },
};
