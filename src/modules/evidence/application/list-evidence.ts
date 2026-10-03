import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { resolveEntityScope } from '@/shared/entity-access';
import { NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { countEntityEvidence, findEvidenceById, findVisibleEvidence, listEntityEvidence } from '../data/evidence.repository';
import type { EvidenceItem, ListEvidenceInput } from '../domain/types';
import { authorizeExternalEntity, authorizeInternalEntity } from './access';
import type { OpenedFile, ProjectFileDeps } from './file-store';

/** Caller must already be authorized for the entity; `db` is the caller's RLS-bound executor. */
export async function listEvidence(db: DbExecutor, input: ListEvidenceInput): Promise<readonly EvidenceItem[]> {
  return listEntityEvidence(db, {
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    contractorOnly: input.audience === 'contractor',
    limit: input.limit,
  });
}

/** Available evidence items for an entity (gates such as "task completion requires a photo"). */
export async function countEvidence(db: DbExecutor, input: Omit<ListEvidenceInput, 'audience'>): Promise<number> {
  return countEntityEvidence(db, input);
}

export interface EvidenceGalleryData {
  readonly projectId: string;
  readonly items: readonly EvidenceItem[];
  /** Internal viewer may remove items it uploaded (or with documents.share). */
  readonly viewerUserId: string | null;
  readonly viewerPrincipalId: string | null;
}

/** Authorized list for the internal gallery (project.view on the entity's project). */
export async function loadInternalEvidenceGallery(
  context: OrgContext,
  input: { readonly entityType: string; readonly entityId: string },
): Promise<EvidenceGalleryData> {
  const scope = await authorizeInternalEntity(context, input);
  const items = await listEvidence(context.db, {
    organizationId: context.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    audience: 'internal',
  });
  return { projectId: scope.projectId, items, viewerUserId: context.userId, viewerPrincipalId: null };
}

/** Authorized list for the contractor gallery (ext.document.view; contractor-visible items only). */
export async function loadExternalEvidenceGallery(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly entityType: string; readonly entityId: string },
): Promise<EvidenceGalleryData> {
  const access = await authorizeExternalEntity(context, {
    ...input,
    capability: EXTERNAL_CAPABILITIES.DOCUMENT_VIEW,
  });
  const items = await listEvidence(context.db, { ...input, audience: 'contractor' });
  return {
    projectId: access.scope.projectId,
    items,
    viewerUserId: null,
    viewerPrincipalId: context.principalId,
  };
}

export interface EvidenceFileDownload extends OpenedFile {
  readonly fileName: string;
}

export async function openInternalEvidenceFile(
  context: OrgContext,
  input: { readonly evidenceId: string; readonly rangeHeader?: string | null },
  deps: Pick<ProjectFileDeps, 'store'>,
): Promise<EvidenceFileDownload> {
  const row = await findEvidenceById(context.db, context.organizationId, input.evidenceId);
  if (!row || row.status !== 'available') throw new NotFoundError('Evidence');
  await authorizeInternalEntity(context, { entityType: row.entityType, entityId: row.entityId, projectId: row.projectId });
  const opened = await deps.store.open({
    organizationId: row.organizationId,
    documentId: row.documentId,
    rangeHeader: input.rangeHeader,
  });
  return { ...opened, mimeType: row.mimeType, fileName: row.fileName };
}

export async function openExternalEvidenceFile(
  context: ExternalContext,
  input: { readonly evidenceId: string; readonly rangeHeader?: string | null },
  deps: Pick<ProjectFileDeps, 'store'>,
): Promise<EvidenceFileDownload> {
  const row = await findVisibleEvidence(context.db, input.evidenceId);
  if (!row || row.status !== 'available' || row.visibility !== 'contractor') throw new NotFoundError('Evidence');
  const scope = await resolveEntityScope(context.db, row.entityType, row.organizationId, row.entityId);
  const ownUpload = row.uploadedByPrincipalId === context.principalId;
  if (!ownUpload && (!scope || scope.internalOnly)) throw new NotFoundError('Evidence');
  const opened = await deps.store.open({
    organizationId: row.organizationId,
    documentId: row.documentId,
    rangeHeader: input.rangeHeader,
  });
  return { ...opened, mimeType: row.mimeType, fileName: row.fileName };
}
