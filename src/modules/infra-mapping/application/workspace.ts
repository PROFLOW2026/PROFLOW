import { z } from 'zod';
import { PROJECT_CAPABILITIES, hasProjectCapability } from '@/modules/project-team';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import {
  findTaskBrief,
  listFolderMappingRows,
  listLocationNodes,
  toFolderDto,
} from '../data/infra.repository';
import { loadShellOrgSettings } from '@/modules/tenancy';
import type { InfraFolderStatusDto, InfraLocationOption, InfraPermissions, InfraType } from '../domain/types';
import { defaultWorkDomain } from '../domain/work-domain';
import {
  actorDb,
  authorizeProject,
  organizationFor,
  viewerCanManageCaptures,
  viewerCanManageLocations,
} from './access';
import type { InfraActor } from './ports';

export interface InfraWorkspaceData {
  readonly organizationId: string;
  readonly projectId: string;
  readonly viewer: 'internal' | 'external';
  readonly locations: readonly InfraLocationOption[];
  readonly folders: readonly InfraFolderStatusDto[];
  readonly permissions: InfraPermissions;
  readonly task: { readonly id: string; readonly title: string } | null;
  /** Set for location managers: whether the organization's cloud is connected (new locations need it). */
  readonly storageConnected?: boolean;
  /** Work domain pre-selected for this business profile (a default only; null = show every domain). */
  readonly defaultWorkDomain?: InfraType | null;
}

/** The organization's business profile decides the pre-selected work domain; any failure means "none". */
async function resolveDefaultWorkDomain(actor: InfraActor, organizationId: string): Promise<InfraType | null> {
  if (actor.kind !== 'internal') return null;
  try {
    const settings = await loadShellOrgSettings(actor.context.db, organizationId);
    return defaultWorkDomain(settings.businessProfileKey);
  } catch {
    return null;
  }
}

/**
 * Everything the workspace screen needs in one authorized read. Safe to call from a server
 * component; throws NotFound / Authorization like every other use-case.
 */
export async function loadInfraWorkspace(
  actor: InfraActor,
  raw: {
    projectId: string;
    organizationId?: string | null;
    taskId?: string | null;
    /** The viewer is an employee-app account: no direct provider links / storage browsing. */
    employeeApp?: boolean;
  },
): Promise<InfraWorkspaceData> {
  const projectId = z.string().uuid().parse(raw.projectId);
  const organizationId = await organizationFor(actor, raw.organizationId);
  const access = await authorizeProject(actor, { organizationId, projectId, need: 'view' });
  const db = actorDb(actor);

  const nodes = await listLocationNodes(db, organizationId, access.projectId);
  const locations: InfraLocationOption[] = nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    code: node.code,
    type: node.type,
    sortOrder: node.sortOrder,
    isActive: node.isActive,
    archived: node.archived,
    ...(node.extraLevelIds ? { extraLevelIds: node.extraLevelIds } : {}),
    ...(node.levelId ? { levelId: node.levelId } : {}),
    ...(node.structure ? { structure: node.structure } : {}),
    ...(node.unitKind ? { unitKind: node.unitKind } : {}),
  }));

  const canManageLocations = await viewerCanManageLocations(actor, access.projectId);
  const folders =
    actor.kind === 'internal' && canManageLocations
      ? (await listFolderMappingRows(db, organizationId, access.projectId)).map(toFolderDto)
      : [];

  let canDocument = true;
  if (actor.kind === 'external') {
    canDocument = actor.context.grants.some(
      (grant) =>
        grant.organizationId === organizationId &&
        (grant.projectId === null || grant.projectId === access.projectId) &&
        grant.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_UPLOAD),
    );
  }
  const canBrowseStorage =
    actor.kind === 'internal' &&
    !raw.employeeApp &&
    (await hasProjectCapability(actor.context, access.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW));

  const taskId = raw.taskId && z.string().uuid().safeParse(raw.taskId).success ? raw.taskId : null;
  const task = taskId ? await findTaskBrief(db, organizationId, access.projectId, taskId) : null;

  return {
    organizationId,
    projectId: access.projectId,
    viewer: actor.kind,
    locations,
    folders,
    permissions: {
      canDocument,
      canManageCaptures: await viewerCanManageCaptures(actor, access.projectId),
      canManageLocations,
      canBrowseStorage,
      canCaptureVideo: actor.kind === 'internal' && !raw.employeeApp && canDocument,
    },
    task,
    defaultWorkDomain: await resolveDefaultWorkDomain(actor, organizationId),
  };
}
