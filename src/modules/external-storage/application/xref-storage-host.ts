import 'server-only';

import { findDocumentById } from '@/modules/documents';
import type { DbExecutor } from '@/shared/db/types';
import { findRevision } from '@/modules/project-plans/data/plans.repository';
import { ensureUsablePrimaryStorageConnection } from './reconcile-primary-storage';
import { resolveValidAccessToken } from './connection-service';
import { getStorageProviderAdapter } from '../providers/registry';
import type { StorageProviderAdapter } from '../domain/provider-interface';

export type XrefStorageHostRuntime = {
  adapter: StorageProviderAdapter;
  accessToken: string;
  connectionId: string;
  startFolderId: string;
  rootFolderId: string;
};

export async function xrefHostFromStorageFile(
  db: DbExecutor,
  organizationId: string,
  hostFileId: string,
  rootFolderId?: string | null,
): Promise<XrefStorageHostRuntime | null> {
  const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
  if (!connection) return null;
  const accessToken = await resolveValidAccessToken(db, organizationId, connection);
  const adapter = getStorageProviderAdapter(connection.provider);
  const meta = await adapter.getFileMetadata(accessToken, hostFileId);
  if (!meta?.parentId) return null;
  const root =
    rootFolderId ??
    (await (async () => {
      let current = meta.parentId!;
      for (let step = 0; step < 40; step += 1) {
        const parent = (await adapter.getFolder(accessToken, current))?.parentId;
        if (!parent || parent === current) return current;
        current = parent;
      }
      return meta.parentId!;
    })());
  return {
    adapter,
    accessToken,
    connectionId: connection.id,
    startFolderId: meta.parentId,
    rootFolderId: root,
  };
}

export async function xrefHostFromDocument(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
  rootFolderId?: string | null,
): Promise<XrefStorageHostRuntime | null> {
  const document = await findDocumentById(db, organizationId, documentId);
  if (!document?.externalFileId || !document.externalConnectionId) return null;
  const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
  if (!connection || connection.id !== document.externalConnectionId) return null;
  return xrefHostFromStorageFile(
    db,
    organizationId,
    document.externalFileId,
    rootFolderId ?? document.externalParentFolderId,
  );
}

export async function xrefHostFromRevision(
  db: DbExecutor,
  organizationId: string,
  revisionId: string,
  projectRootFolderId?: string | null,
): Promise<(XrefStorageHostRuntime & { projectId: string }) | null> {
  const revision = await findRevision(db, organizationId, revisionId);
  if (!revision?.documentId) return null;
  const host = await xrefHostFromDocument(db, organizationId, revision.documentId, projectRootFolderId);
  if (!host) return null;
  return { ...host, projectId: revision.projectId };
}