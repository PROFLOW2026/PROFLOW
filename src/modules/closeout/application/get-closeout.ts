import { findProjectById, assertCanAccessProject } from '@/modules/projects';
import { listProjectWarrantyCoverages } from '@/modules/warranty';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission, assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { collectCloseoutReadiness } from './collect-readiness';
import { buildCloseoutFinancialSnapshot } from '../domain/snapshot';
import { isCloseoutEligibleWorkKind } from '../domain/close-rules';
import type {
  CloseoutEventRecord,
  CloseoutFinancialSnapshot,
  CloseoutRecord,
  ReadinessItem,
} from '../domain/types';
import { findCloseoutByProject, listCloseoutEvents } from '../data/closeout.repository';

export interface CloseoutWorkspace {
  readonly projectId: string;
  readonly projectName: string;
  readonly workKind: string;
  readonly projectStatus: string;
  readonly closeoutEligible: boolean;
  readonly closeout: CloseoutRecord | null;
  readonly items: readonly ReadinessItem[];
  readonly events: readonly CloseoutEventRecord[];
  readonly snapshot: CloseoutFinancialSnapshot | null;
  readonly canUpdate: boolean;
  readonly canReadProfit: boolean;
  /**
   * True when the project has at least one warranty coverage. Used to
   * show a non-blocking "setup warranty" prompt after project is closed.
   */
  readonly hasWarrantyCoverage: boolean;
  /**
   * Project completion date (actual_end_date). Used to pre-fill the
   * warranty start date when prompting setup after closeout.
   */
  readonly projectActualEndDate: string | null;
}

export async function getCloseoutWorkspace(
  context: OrgContext,
  projectId: string,
): Promise<CloseoutWorkspace> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  await assertCanAccessProject(context, projectId);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const closeout = await findCloseoutByProject(context.db, context.organizationId, projectId);
  const collected = await collectCloseoutReadiness(context, projectId);
  const events = closeout
    ? await listCloseoutEvents(context.db, context.organizationId, closeout.id)
    : [];

  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  let snapshot: CloseoutFinancialSnapshot | null = null;
  if (closeout?.financialSnapshotJson && typeof closeout.financialSnapshotJson === 'object') {
    snapshot = closeout.financialSnapshotJson as CloseoutFinancialSnapshot;
  } else if (collected.financials) {
    snapshot = buildCloseoutFinancialSnapshot(collected.financials, {
      canReadProfit,
      retentionHeld: collected.retentionHeld,
    });
  }

  // Non-blocking: check if warranty coverage already exists so we can
  // prompt the user to set it up if the project just closed.
  const hasWarrantyCoverage = await (async () => {
    if (!hasPermission(context, PERMISSIONS.PROJECTS_READ)) return false;
    try {
      const coverages = await listProjectWarrantyCoverages(context, projectId);
      return coverages.coverages.length > 0;
    } catch {
      return false;
    }
  })();

  return {
    projectId: project.id,
    projectName: project.name,
    workKind: project.workKind,
    projectStatus: project.status,
    closeoutEligible: isCloseoutEligibleWorkKind(project.workKind),
    closeout,
    items: collected.items,
    events,
    snapshot,
    canUpdate: hasPermission(context, PERMISSIONS.PROJECTS_UPDATE),
    canReadProfit,
    hasWarrantyCoverage,
    projectActualEndDate: project.actualEndDate ?? null,
  };
}

export { listCloseoutStatusesForProjects } from './list-closeout-statuses';
