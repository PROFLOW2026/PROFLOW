import 'server-only';

import { findClientById } from '@/modules/clients';
import { findProjectById } from '@/modules/projects';
import type { DbExecutor } from '@/shared/db/types';
import type { StorageConnectionRecord } from '../domain/types';
import { ensureProjectFolderTree } from './folder-provisioning';

/** Ensures the direct project folder, its semantic children, and the info file. */
export async function provisionStoredProjectFolder(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    projectId: string;
  },
): Promise<string | null> {
  const project = await findProjectById(db, input.organizationId, input.projectId);
  if (!project) return null;
  const client = project.clientId
    ? await findClientById(db, input.organizationId, project.clientId)
    : null;
  return ensureProjectFolderTree(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    projectId: project.id,
    projectName: project.name,
    documentNumber: project.documentNumber,
    clientId: project.clientId,
    clientName: client?.name ?? null,
  });
}
