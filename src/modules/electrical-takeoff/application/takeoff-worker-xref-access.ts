import 'server-only';

import { z } from 'zod';
import type { DbExecutor } from '@/shared/db/types';
import { createContractorXrefFileGate } from '@/modules/project-plans/application/contractor-xref-gate';
import {
  findContractorPrincipalByAuthUser,
  grantRowToView,
  listLiveGrantsForPrincipal,
} from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import {
  ensureUsablePrimaryStorageConnection,
  listFolderMappingsForProject,
} from '@/modules/external-storage/server';

const requestActorSchema = z.object({
  kind: z.enum(['internal', 'contractor', 'employee']),
  userId: z.string().uuid(),
});

export function readTakeoffJobRequestActor(requestJson: unknown): z.infer<typeof requestActorSchema> | null {
  if (!requestJson || typeof requestJson !== 'object') return null;
  const raw = (requestJson as Record<string, unknown>).requestActor;
  const parsed = requestActorSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function loadContractorContextForWorker(
  db: DbExecutor,
  authUserId: string,
): Promise<ExternalContext | null> {
  const principal = await findContractorPrincipalByAuthUser(db, authUserId);
  if (!principal || principal.status !== 'active' || principal.archivedAt) return null;
  const grants = (await listLiveGrantsForPrincipal(db, principal.id, new Date()))
    .map(grantRowToView)
    .filter((grant): grant is NonNullable<typeof grant> => grant !== null);
  return {
    principalId: principal.id,
    authUserId,
    displayName: principal.displayName ?? null,
    grants,
    locale: 'he',
    db,
  };
}

export async function resolveWorkerXrefAccess(input: {
  db: DbExecutor;
  organizationId: string;
  projectId: string;
  requestJson: unknown;
}): Promise<{
  gate?: (providerFileId: string) => Promise<'allow' | 'hidden'>;
  rootFolderId?: string;
} | null> {
  const actor = readTakeoffJobRequestActor(input.requestJson);
  if (!actor) return null;

  const connection = await ensureUsablePrimaryStorageConnection(input.db, input.organizationId);
  if (!connection) return null;

  if (actor.kind === 'contractor') {
    const context = await loadContractorContextForWorker(input.db, actor.userId);
    if (!context) return null;
    const mappings = await listFolderMappingsForProject(
      input.db,
      input.organizationId,
      connection.id,
      input.projectId,
    );
    const plansRoot = mappings.find((row) => row.semanticFolderType === 'plans' && row.status === 'ready');
    const gate = await createContractorXrefFileGate({
      context,
      db: input.db,
      organizationId: input.organizationId,
      projectId: input.projectId,
      connectionId: connection.id,
    });
    return {
      gate,
      rootFolderId: plansRoot?.externalFolderId ?? undefined,
    };
  }

  return {};
}