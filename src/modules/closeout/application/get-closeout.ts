import { findProjectById, assertCanAccessProject } from '@/modules/projects';
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
  CloseoutStatus,
  ReadinessItem,
} from '../domain/types';
import {
  findCloseoutByProject,
  listCloseoutEvents,
  listCloseoutStatusesByProjectIds,
} from '../data/closeout.repository';

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
  };
}

export async function listCloseoutStatusesForProjects(
  context: OrgContext,
  projectIds: readonly string[],
): Promise<readonly { readonly projectId: string; readonly status: CloseoutStatus }[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  try {
    return await listCloseoutStatusesByProjectIds(
      context.db,
      context.organizationId,
      projectIds,
    );
  } catch {
    return [];
  }
}
