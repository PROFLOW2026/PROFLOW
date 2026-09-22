import 'server-only';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  clients,
  organizationStorageConnections,
  projects,
  storageFolderMappings,
} from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { findStorageConnectionById, updateStorageConnection } from '../data/connections.repository';
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
  /** Non-retryable provider/account failure — stop chain and surface lastError. */
  readonly fatalError?: string;
}

function isTransient(error: unknown): boolean {
  if (error instanceof ProviderHttpError) return error.isTransient();
  if (error instanceof Error && /timeout|ETIMEDOUT|ECONNRESET|fetch failed|aborted/i.test(error.message)) {
    return true;
  }
  return false;
}

function nonRetryableMessage(error: unknown): string | null {
  if (!(error instanceof ProviderHttpError)) return null;
  if (error.isQuotaExceeded()) {
    return `provider_quota_exceeded: ${error.bodySnippet}`.slice(0, 500);
  }
  if (error.isUnauthorized()) {
    return `provider_auth_failed: ${error.bodySnippet}`.slice(0, 500);
  }
  return null;
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
        isNull(clients.archivedAt),
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
      const fatal = nonRetryableMessage(error);
      if (fatal) {
        await updateStorageConnection(db, input.organizationId, gatedConnection.id, {
          lastError: fatal,
        });
        console.error('[org-storage/provision] client folder non-retryable', {
          organizationId: input.organizationId,
          clientId: client.id,
          fatal,
        });
        return {
          clientsProcessed,
          projectsProcessed: 0,
          remaining: 1,
          rateLimited: false,
          fatalError: fatal,
        };
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
        isNull(projects.archivedAt),
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
      const fatal = nonRetryableMessage(error);
      if (fatal) {
        await updateStorageConnection(db, input.organizationId, gatedConnection.id, {
          lastError: fatal,
        });
        console.error('[org-storage/provision] project folder non-retryable', {
          organizationId: input.organizationId,
          projectId: project.id,
          fatal,
        });
        return {
          clientsProcessed,
          projectsProcessed,
          remaining: 1,
          rateLimited: false,
          fatalError: fatal,
        };
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
        isNull(clients.archivedAt),
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
        isNull(projects.archivedAt),
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
  const { resolveStorageProvisionWorkerTarget, postStorageProvisionWorker } = await import(
    './kick-storage-provision'
  );
  const target = resolveStorageProvisionWorkerTarget();
  if (!target) {
    console.error('[org-storage/provision] chain aborted: STORAGE_PROVISION_WORKER_SECRET/URL missing', {
      chain: next.chain,
    });
    return;
  }

  console.info('[org-storage/provision] chain next HTTP', {
    url: target.url,
    chain: next.chain,
    rateLimitStreak: next.rateLimitStreak,
    delayMs: next.delayMs,
  });

  if (next.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, next.delayMs));
  }

  // Next worker accepts immediately (work runs in its after()), so this fetch
  // returns quickly and does not nest the remaining chain.
  try {
    const response = await postStorageProvisionWorker({
      chain: next.chain,
      rateLimitStreak: next.rateLimitStreak,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[org-storage/provision] chain HTTP failed', {
        status: response.status,
        body: body.slice(0, 300),
        chain: next.chain,
      });
      return;
    }
    console.info('[org-storage/provision] chain HTTP accepted', {
      status: response.status,
      chain: next.chain,
    });
  } catch (error) {
    console.error('[org-storage/provision] chain fetch failed', {
      detail: error instanceof Error ? error.message : String(error),
      chain: next.chain,
    });
  }
}

/** Wall-clock budget for multi-batch work inside one worker after() invocation. */
const STORAGE_PROVISION_CYCLE_BUDGET_MS = 240_000;

export async function runStorageProvisionCycle(input: {
  chain?: number;
  rateLimitStreak?: number;
  scheduleNext?: (next: { chain: number; rateLimitStreak: number; delayMs: number }) => Promise<void>;
} = {}): Promise<StorageProvisionBatchResult & { readonly continued: boolean }> {
  const chain = input.chain ?? 0;
  let rateLimitStreak = input.rateLimitStreak ?? 0;
  const scheduleNext = input.scheduleNext ?? scheduleStorageProvisionNext;
  const db = getAdminDb();
  const cycleStarted = Date.now();
  console.info('[org-storage/provision] cycle begin', { chain, rateLimitStreak });
  const connections = await db
    .select({
      id: organizationStorageConnections.id,
      organizationId: organizationStorageConnections.organizationId,
      isPrimary: organizationStorageConnections.isPrimary,
    })
    .from(organizationStorageConnections)
    .where(eq(organizationStorageConnections.status, 'connected'))
    .orderBy(sql`${organizationStorageConnections.isPrimary} desc`, organizationStorageConnections.id);

  console.info('[org-storage/provision] cycle connected_count', { count: connections.length });

  let last: StorageProvisionBatchResult = {
    clientsProcessed: 0,
    projectsProcessed: 0,
    remaining: 0,
    rateLimited: false,
  };

  let totals = { clientsProcessed: 0, projectsProcessed: 0 };

  connectionLoop: for (const row of connections) {
    try {
      const connection = await findStorageConnectionById(db, row.organizationId, row.id);
      if (!connection) continue;
      if (
        connection.lastError &&
        /provider_quota_exceeded|provider_auth_failed/i.test(connection.lastError)
      ) {
        console.error('[org-storage/provision] connection has non-retryable lastError — skip until Owner intervenes', {
          connectionId: row.id,
        });
        last = {
          clientsProcessed: 0,
          projectsProcessed: 0,
          remaining: 1,
          rateLimited: false,
          fatalError: connection.lastError,
        };
        continue;
      }

      const accessToken = await resolveValidAccessToken(db, row.organizationId, connection);

      // Multi-batch within this invocation — fewer HTTP hops on serverless.
      while (Date.now() - cycleStarted < STORAGE_PROVISION_CYCLE_BUDGET_MS) {
        last = await runStorageProvisionBatch(db, {
          organizationId: row.organizationId,
          connectionId: row.id,
          accessToken,
        });
        totals.clientsProcessed += last.clientsProcessed;
        totals.projectsProcessed += last.projectsProcessed;
        console.info('[org-storage/provision] cycle batch', {
          connectionId: row.id,
          clientsProcessed: last.clientsProcessed,
          projectsProcessed: last.projectsProcessed,
          remaining: last.remaining,
          rateLimited: last.rateLimited,
          fatalError: last.fatalError ?? null,
          elapsedMs: Date.now() - cycleStarted,
        });

        if (last.fatalError) break connectionLoop;
        if ((last.clientsProcessed > 0 || last.projectsProcessed > 0) && connection.lastError) {
          await updateStorageConnection(db, row.organizationId, row.id, { lastError: null });
        }
        if (last.remaining <= 0) break connectionLoop;

        if (last.rateLimited) {
          rateLimitStreak += 1;
          const step = nextStorageProvisionStep({
            remaining: last.remaining,
            rateLimited: true,
            chain,
            rateLimitStreak: rateLimitStreak - 1,
          });
          const delayMs = step.delayMs;
          const remainingBudget = STORAGE_PROVISION_CYCLE_BUDGET_MS - (Date.now() - cycleStarted);
          if (delayMs > 0 && delayMs + 5_000 < remainingBudget) {
            console.info('[org-storage/provision] in-cycle rate-limit backoff', {
              delayMs,
              rateLimitStreak,
            });
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
          // Not enough budget for backoff — hand off to next HTTP hop.
          break connectionLoop;
        }

        rateLimitStreak = 0;
        if (last.clientsProcessed === 0 && last.projectsProcessed === 0) {
          // No progress this batch but remaining > 0 — avoid tight spin.
          break connectionLoop;
        }
      }

      if (last.remaining > 0 || last.rateLimited) break;
    } catch (error) {
      if (isTransient(error)) {
        last = { ...last, remaining: 1, rateLimited: true };
        break;
      }
      const fatal = nonRetryableMessage(error);
      if (fatal) {
        await updateStorageConnection(db, row.organizationId, row.id, { lastError: fatal });
        last = { ...last, remaining: 1, rateLimited: false, fatalError: fatal };
        break;
      }
      console.error('[org-storage/provision] connection skipped', {
        connectionId: row.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  last = {
    ...last,
    clientsProcessed: totals.clientsProcessed,
    projectsProcessed: totals.projectsProcessed,
  };

  if (last.fatalError) {
    console.error('[org-storage/provision] cycle stopped — non-retryable', {
      chain,
      fatalError: last.fatalError,
    });
    return { ...last, continued: false };
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
