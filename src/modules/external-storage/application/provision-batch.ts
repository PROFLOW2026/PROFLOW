import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';
import {
  clients,
  organizationStorageConnections,
  projects,
  storageFolderMappings,
} from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { findStorageConnectionById } from '../data/connections.repository';
import {
  STORAGE_PROVISION_CLIENT_BATCH,
  STORAGE_PROVISION_PROJECT_BATCH,
  nextStorageProvisionStep,
} from '../domain/project-folder-placement';
import { PROJECT_INFO_FILE_NAME, CLIENT_INFO_FILE_NAME } from '../domain/project-info-text';
import { ProviderHttpError } from '../providers/http-utils';
import { ensureClientFolderTree, ensureOrganizationRootFolder } from './folder-provisioning';
import { provisionStoredProjectFolder } from './project-provision';
import { resolveValidAccessToken } from './connection-service';

const PROJECT_CHILD_TYPES = [
  'quotes',
  'contracts',
  'billing',
  'vendor_invoices',
  'plans',
  'photos',
  'documents',
  'general_files',
] as const;

export interface StorageProvisionBatchResult {
  readonly clientsProcessed: number;
  readonly projectsProcessed: number;
  readonly remaining: number;
  readonly rateLimited: boolean;
}

function isTransient(error: unknown): boolean {
  if (error instanceof ProviderHttpError) return error.isTransient();
  if (error instanceof Error && /timeout|ETIMEDOUT|ECONNRESET|fetch failed|aborted/i.test(error.message)) {
    return true;
  }
  return false;
}

function canonicalProjectSql(connectionId: string, projectsRootId: string) {
  const childList = sql.join(
    PROJECT_CHILD_TYPES.map((type) => sql`${type}`),
    sql`, `,
  );
  return sql`
    exists (
      select 1
      from public.storage_folder_mappings root
      where root.organization_id = ${projects.organizationId}
        and root.connection_id = ${connectionId}::uuid
        and root.entity_id = ${projects.id}
        and root.semantic_folder_type = 'project_root'
        and root.status = 'ready'
        and root.external_parent_id = ${projectsRootId}
        and (
          select count(*)::int
          from public.storage_folder_mappings child
          where child.organization_id = root.organization_id
            and child.connection_id = root.connection_id
            and child.entity_id = root.entity_id
            and child.status = 'ready'
            and child.external_parent_id = root.external_folder_id
            and child.semantic_folder_type in (${childList})
        ) = ${PROJECT_CHILD_TYPES.length}
        and exists (
          select 1
          from public.storage_files file
          where file.organization_id = root.organization_id
            and file.connection_id = root.connection_id
            and file.external_parent_folder_id = root.external_folder_id
            and file.original_filename = ${PROJECT_INFO_FILE_NAME}
            and file.status = 'synced'
        )
    )
  `;
}

export async function runStorageProvisionBatch(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    accessToken: string;
  },
): Promise<StorageProvisionBatchResult> {
  const connection = await findStorageConnectionById(db, input.organizationId, input.connectionId);
  if (!connection || connection.status !== 'connected') {
    return { clientsProcessed: 0, projectsProcessed: 0, remaining: 0, rateLimited: false };
  }

  await ensureOrganizationRootFolder(db, input.organizationId, connection, input.accessToken);

  const {
    connectionTemplateApproved,
    reconcileProjectTemplateGateState,
  } = await import('./project-template-service');
  let gatedConnection = await reconcileProjectTemplateGateState(
    db,
    input.organizationId,
    connection,
  );
  gatedConnection =
    (await findStorageConnectionById(db, input.organizationId, connection.id)) ?? gatedConnection;

  if (!connectionTemplateApproved(gatedConnection)) {
    return { clientsProcessed: 0, projectsProcessed: 0, remaining: 0, rateLimited: false };
  }

  const roots = await db
    .select({
      semantic: storageFolderMappings.semanticFolderType,
      externalFolderId: storageFolderMappings.externalFolderId,
    })
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, input.organizationId),
        eq(storageFolderMappings.connectionId, gatedConnection.id),
        sql`${storageFolderMappings.semanticFolderType} in ('clients_root', 'projects_root')`,
        eq(storageFolderMappings.status, 'ready'),
      ),
    );
  const clientsRootId = roots.find((row) => row.semantic === 'clients_root')?.externalFolderId ?? null;
  const projectsRootId = roots.find((row) => row.semantic === 'projects_root')?.externalFolderId ?? null;
  if (!clientsRootId || !projectsRootId) {
    return { clientsProcessed: 0, projectsProcessed: 0, remaining: 1, rateLimited: false };
  }

  const pendingClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, input.organizationId),
        sql`not exists (
          select 1 from public.storage_folder_mappings m
          where m.organization_id = ${clients.organizationId}
            and m.connection_id = ${gatedConnection.id}::uuid
            and m.semantic_folder_type = 'client_root'
            and m.entity_id = ${clients.id}
            and m.status = 'ready'
            and m.external_parent_id = ${clientsRootId}
            and exists (
              select 1 from public.storage_files file
              where file.organization_id = m.organization_id
                and file.connection_id = m.connection_id
                and file.external_parent_folder_id = m.external_folder_id
                and file.original_filename = ${CLIENT_INFO_FILE_NAME}
                and file.status = 'synced'
            )
        )`,
      ),
    )
    .orderBy(asc(clients.id))
    .limit(STORAGE_PROVISION_CLIENT_BATCH);

  let clientsProcessed = 0;
  for (const client of pendingClients) {
    try {
      await ensureClientFolderTree(db, {
        organizationId: input.organizationId,
        connection: gatedConnection,
        accessToken: input.accessToken,
        clientId: client.id,
        clientName: client.name,
      });
      clientsProcessed += 1;
    } catch (error) {
      if (isTransient(error)) {
        return { clientsProcessed, projectsProcessed: 0, remaining: 1, rateLimited: true };
      }
      console.error('[org-storage/provision] client folder failed', {
        organizationId: input.organizationId,
        clientId: client.id,
      });
    }
  }

  const pendingProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, input.organizationId),
        sql`not ${canonicalProjectSql(gatedConnection.id, projectsRootId)}`,
      ),
    )
    .orderBy(asc(projects.id))
    .limit(STORAGE_PROVISION_PROJECT_BATCH);

  let projectsProcessed = 0;
  for (const project of pendingProjects) {
    try {
      await provisionStoredProjectFolder(db, {
        organizationId: input.organizationId,
        connection: gatedConnection,
        accessToken: input.accessToken,
        projectId: project.id,
      });
      projectsProcessed += 1;
    } catch (error) {
      if (isTransient(error)) {
        return { clientsProcessed, projectsProcessed, remaining: 1, rateLimited: true };
      }
      console.error('[org-storage/provision] project folder failed', {
        organizationId: input.organizationId,
        projectId: project.id,
      });
    }
  }

  const [clientRemain] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, input.organizationId),
        sql`not exists (
          select 1 from public.storage_folder_mappings m
          where m.organization_id = ${clients.organizationId}
            and m.connection_id = ${gatedConnection.id}::uuid
            and m.semantic_folder_type = 'client_root'
            and m.entity_id = ${clients.id}
            and m.status = 'ready'
            and m.external_parent_id = ${clientsRootId}
            and exists (
              select 1 from public.storage_files file
              where file.organization_id = m.organization_id
                and file.connection_id = m.connection_id
                and file.external_parent_folder_id = m.external_folder_id
                and file.original_filename = ${CLIENT_INFO_FILE_NAME}
                and file.status = 'synced'
            )
        )`,
      ),
    );
  const [projectRemain] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, input.organizationId),
        sql`not ${canonicalProjectSql(gatedConnection.id, projectsRootId)}`,
      ),
    );

  return {
    clientsProcessed,
    projectsProcessed,
    remaining: (clientRemain?.n ?? 0) + (projectRemain?.n ?? 0),
    rateLimited: false,
  };
}

async function scheduleStorageProvisionNext(next: {
  chain: number;
  rateLimitStreak: number;
  delayMs: number;
}): Promise<void> {
  if (next.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, next.delayMs));
  }
  const secret = process.env.OCR_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!secret || !origin) return;
  await fetch(`${origin.replace(/\/$/, '')}/api/internal/storage-provision-worker`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chain: next.chain, rateLimitStreak: next.rateLimitStreak }),
  }).catch(() => undefined);
}

export async function runStorageProvisionCycle(input: {
  chain?: number;
  rateLimitStreak?: number;
  scheduleNext?: (next: { chain: number; rateLimitStreak: number; delayMs: number }) => Promise<void>;
} = {}): Promise<StorageProvisionBatchResult & { readonly continued: boolean }> {
  const chain = input.chain ?? 0;
  const rateLimitStreak = input.rateLimitStreak ?? 0;
  const scheduleNext = input.scheduleNext ?? scheduleStorageProvisionNext;
  const db = getAdminDb();
  const connections = await db
    .select({
      id: organizationStorageConnections.id,
      organizationId: organizationStorageConnections.organizationId,
      isPrimary: organizationStorageConnections.isPrimary,
    })
    .from(organizationStorageConnections)
    .where(eq(organizationStorageConnections.status, 'connected'))
    .orderBy(sql`${organizationStorageConnections.isPrimary} desc`, organizationStorageConnections.id);

  let last: StorageProvisionBatchResult = {
    clientsProcessed: 0,
    projectsProcessed: 0,
    remaining: 0,
    rateLimited: false,
  };

  for (const row of connections) {
    try {
      const connection = await findStorageConnectionById(db, row.organizationId, row.id);
      if (!connection) continue;
      const accessToken = await resolveValidAccessToken(db, row.organizationId, connection);
      last = await runStorageProvisionBatch(db, {
        organizationId: row.organizationId,
        connectionId: row.id,
        accessToken,
      });
      if (last.remaining > 0 || last.rateLimited) break;
    } catch (error) {
      if (isTransient(error)) {
        last = { ...last, remaining: 1, rateLimited: true };
        break;
      }
      console.error('[org-storage/provision] connection skipped', { connectionId: row.id });
    }
  }

  const step = nextStorageProvisionStep({
    remaining: last.remaining,
    rateLimited: last.rateLimited,
    chain,
    rateLimitStreak,
  });
  if (step.continue) {
    await scheduleNext({
      chain: step.chain,
      rateLimitStreak: step.rateLimitStreak,
      delayMs: step.delayMs,
    });
  }
  return { ...last, continued: step.continue };
}
