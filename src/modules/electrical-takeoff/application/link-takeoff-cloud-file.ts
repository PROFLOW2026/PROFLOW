import path from 'node:path';

import type { OrgContext } from '@/shared/auth/context';
import { ensureDocumentForProviderFile } from '@/modules/external-storage/server';
import type { EnsureDocumentForProviderFileInput } from '@/modules/external-storage/application/link-provider-file-to-document';

export type LinkTakeoffCloudFileClientInput = Omit<EnsureDocumentForProviderFileInput, 'projectId'>;

import { TakeoffError } from '../domain/errors';
import { assertAnalysisAccess, internalActorFrom } from './access';
import { inferTakeoffSourceKind, takeoffLinkedDocumentMime } from './takeoff-source-kind';
import { TAKEOFF_PERSISTENCE } from './takeoff-persistence';
import { assertOrgStorage } from '../server';
import { insertFile } from '../data/takeoff.repository';
import { mimeForKind } from './takeoff-file-store';

export async function linkTakeoffCloudFileUseCase(
  context: OrgContext,
  analysisId: string,
  input: LinkTakeoffCloudFileClientInput,
): Promise<{ fileId: string; kind: 'pdf' | 'dwg' | 'dxf' }> {
  const analysis = await assertAnalysisAccess(internalActorFrom(context), analysisId, 'manage');
  if (analysis.status === 'approved') throw new TakeoffError('analysis_locked_approved');
  if (analysis.persistenceMode !== TAKEOFF_PERSISTENCE.persistent) {
    throw new TakeoffError('forbidden');
  }
  await assertOrgStorage(context.db, context.organizationId);

  const safeName = path.basename(input.fileName).replaceAll(/[/\\<>:"|?*]/g, '_');
  const kind = inferTakeoffSourceKind(safeName, input.mimeType);
  if (!kind) throw new TakeoffError('file_type_unsupported');

  const doc = await ensureDocumentForProviderFile(context, {
    projectId: analysis.projectId,
    providerFileId: input.providerFileId,
    fileName: safeName,
    mimeType: takeoffLinkedDocumentMime(safeName, input.mimeType, kind),
    parentFolderId: input.parentFolderId,
    semanticFolderType: input.semanticFolderType,
  });

  const row = await insertFile(context.db, {
    organizationId: context.organizationId,
    projectId: analysis.projectId,
    analysisId,
    name: safeName,
    kind,
    mimeType: mimeForKind(kind),
    sizeBytes: doc.sizeBytes ?? 1,
    sha256: doc.checksum ?? null,
    storageDocumentId: doc.id,
    uploadState: 'complete',
    uploadedByUserId: context.userId,
  });

  return { fileId: row.id, kind };
}