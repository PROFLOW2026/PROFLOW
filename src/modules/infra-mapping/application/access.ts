import { z } from 'zod';
import { PROJECT_CAPABILITIES, assertProjectCapability, hasProjectCapability } from '@/modules/project-team';
import { authorizeExternalEntity, authorizeInternalEntity } from '@/modules/evidence';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, externalGrantCovers } from '@/shared/external';
import type { DbExecutor } from '@/shared/db/types';
import { listLocationNodes, type CaptureJoinRow, type CaptureRow } from '../data/infra.repository';
import { allowedLocationSet } from '../domain/location-scope';
import { INFRA_ENTITY_TYPE, type InfraActor } from './ports';

/**
 * One authorization surface for both callers.
 *  - internal (owner app / employee app): `project.view` to browse (`need: 'view'`); `documents.view`
 *    on top of that to document / host Live Share (`need: 'document'`); `documents.share` /
 *    `project.manage` to manage other people's captures; `project.manage` for locations and folders.
 *  - external (contractor): a grant carrying `ext.document.upload` / `ext.document.view` that covers
 *    the project. Contractors never see another company's captures (RLS) and never browse storage.
 * Nothing here needs a personal cloud connection: bytes go to the owning organization's storage.
 */

export interface InfraAccess {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string | null;
  /** May edit / remove other people's captures. */
  readonly canManageCaptures: boolean;
  /** Contractor limited to specific units: every location it may reach. null / absent = the whole project. */
  readonly allowedLocationIds?: ReadonlySet<string> | null;
}

export async function organizationFor(actor: InfraActor, requested: string | null | undefined): Promise<string> {
  if (actor.kind === 'internal') return actor.context.organizationId;
  const parsed = z.string().uuid().safeParse(requested);
  if (!parsed.success) throw new NotFoundError('Organization');
  if (!actor.context.grants.some((grant) => grant.organizationId === parsed.data)) throw new NotFoundError('Organization');
  return parsed.data;
}

/** Access to document infrastructure at a location (the location must belong to the project). */
export async function authorizeLocation(
  actor: InfraActor,
  input: { organizationId: string; projectId: string; locationId: string; need: 'view' | 'document' },
): Promise<InfraAccess> {
  if (actor.kind === 'internal') {
    const scope = await authorizeInternalEntity(actor.context, {
      entityType: INFRA_ENTITY_TYPE,
      entityId: input.locationId,
      projectId: input.projectId,
    });
    const canManageCaptures = await canManage(actor, scope.projectId);
    return { organizationId: input.organizationId, projectId: scope.projectId, vendorId: null, canManageCaptures };
  }
  const access = await authorizeExternalEntity(actor.context, {
    organizationId: input.organizationId,
    entityType: INFRA_ENTITY_TYPE,
    entityId: input.locationId,
    projectId: input.projectId,
    capability: input.need === 'view' ? EXTERNAL_CAPABILITIES.DOCUMENT_VIEW : EXTERNAL_CAPABILITIES.DOCUMENT_UPLOAD,
  });
  return {
    organizationId: input.organizationId,
    projectId: access.scope.projectId,
    vendorId: access.vendorId,
    canManageCaptures: false,
  };
}

/** Access to a project as a whole (gallery, location tree, comparisons list, Live Share host). */
export async function authorizeProject(
  actor: InfraActor,
  input: { organizationId: string; projectId: string; need: 'view' | 'document' },
): Promise<InfraAccess> {
  if (actor.kind === 'internal') {
    await assertProjectCapability(actor.context, input.projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
    // Live Share host / document writes require documents.view — PROJECT_VIEW alone is not enough.
    if (input.need === 'document') {
      await assertProjectCapability(actor.context, input.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
    }
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: null,
      canManageCaptures: await canManage(actor, input.projectId),
    };
  }
  const capability = input.need === 'view' ? EXTERNAL_CAPABILITIES.DOCUMENT_VIEW : EXTERNAL_CAPABILITIES.DOCUMENT_UPLOAD;
  const covering = actor.context.grants.filter((candidate) =>
    externalGrantCovers(
      candidate,
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        vendorId: candidate.vendorId,
        subcontractAgreementId: candidate.subcontractAgreementId,
      },
      capability,
    ),
  );
  const grant = covering[0];
  if (!grant) throw new AuthorizationError(`external:${capability}`);
  // A contractor limited to specific units only reaches those (and everything below them).
  const restricted = covering.some((candidate) => (candidate.allowedLocationIds?.length ?? 0) > 0);
  const allowedLocationIds = restricted
    ? allowedLocationSet(covering, await listLocationNodes(actorDb(actor), input.organizationId, input.projectId))
    : null;
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorId: grant.vendorId,
    canManageCaptures: false,
    allowedLocationIds,
  };
}

async function canManage(actor: InfraActor, projectId: string): Promise<boolean> {
  if (actor.kind !== 'internal') return false;
  return (
    (await hasProjectCapability(actor.context, projectId, PROJECT_CAPABILITIES.DOCUMENTS_SHARE)) ||
    (await hasProjectCapability(actor.context, projectId, PROJECT_CAPABILITIES.PROJECT_MANAGE))
  );
}

/** Locations and cloud folders are managed with `project.manage`. */
export async function assertCanManageLocations(actor: InfraActor, projectId: string): Promise<void> {
  if (actor.kind !== 'internal') throw new AuthorizationError('project:project.manage');
  await assertProjectCapability(actor.context, projectId, PROJECT_CAPABILITIES.PROJECT_MANAGE);
}

export async function viewerCanManageLocations(actor: InfraActor, projectId: string): Promise<boolean> {
  if (actor.kind !== 'internal') return false;
  return hasProjectCapability(actor.context, projectId, PROJECT_CAPABILITIES.PROJECT_MANAGE);
}

export async function viewerCanManageCaptures(actor: InfraActor, projectId: string): Promise<boolean> {
  return canManage(actor, projectId);
}

type Authored = Pick<CaptureRow | CaptureJoinRow, 'createdByUserId' | 'createdByPrincipalId'> & {
  readonly createdByActorType?: 'internal' | 'external';
  readonly actorType?: 'internal' | 'external';
};

/** Whether the viewer authored the row (own captures are always editable). */
export function isAuthor(actor: InfraActor, row: Authored): boolean {
  const type = row.createdByActorType ?? row.actorType;
  if (actor.kind === 'internal') return type === 'internal' && row.createdByUserId === actor.context.userId;
  return type === 'external' && row.createdByPrincipalId === actor.context.principalId;
}

export async function assertCanEditCapture(actor: InfraActor, row: CaptureRow): Promise<void> {
  if (isAuthor(actor, row)) {
    if (actor.kind === 'external') {
      // A contractor keeps edit rights only while its grant still allows uploading.
      await authorizeProject(actor, { organizationId: row.organizationId, projectId: row.projectId, need: 'document' });
    }
    return;
  }
  if (actor.kind === 'internal' && (await canManage(actor, row.projectId))) return;
  throw new NotFoundError('Capture');
}

export type { DbExecutor };

export function actorDb(actor: InfraActor): DbExecutor {
  return actor.context.db;
}

export function actorUserId(actor: InfraActor): string | null {
  return actor.kind === 'internal' ? actor.context.userId : null;
}

export function actorPrincipalId(actor: InfraActor): string | null {
  return actor.kind === 'external' ? actor.context.principalId : null;
}
