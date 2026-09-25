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
  STORAGE_PROVISION_CHAIN_DEFERRED_ERROR,
  STORAGE_PROVISION_CLIENT_BATCH,
  STORAGE_PROVISION_PROJECT_BATCH,
  nextStorageProvisionStep,
} from '../domain/project-folder-placement';
import { PROJECT_INFO_FILE_NAME, CLIENT_INFO_FILE_NAME } from '../domain/project-info-text';
import { ProviderHttpError } from '../providers/http-utils';
import { ensureClientFolderTree, ensureOrganizationRootFolder } from './folder-provisioning';
import { provisionStoredProjectFolder } from './project-provision';
import { resolveValidAccessToken } from './connection-service';
import {
  acquireStorageProvisionLease,
  releaseStorageProvisionLease,
} from './provision-chain-lease';
import { shouldScheduleStorageProvisionHop } from '../domain/provision-chain-lease';

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

  // Bounded provider reconciliation — invalidate READY mappings whose folders
  // were deleted outside ProjectFlow so normal provisioning recreates them.
  const { reconcileStaleReadyMappingsBatch } = await import('./provider-tree-health');
  await reconcileStaleReadyMappingsBatch(db, {
    organizationId: input.organizationId,
    connection,
    accessToken: input.accessToken,
  });

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
  chainToken: string;
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

  // Next worker accepts immediately and continues via waitUntil — this fetch
  // returns quickly and must not wait for the rest of the org to finish.
  try {
    const response = await postStorageProvisionWorker({
      chain: next.chain,
      rateLimitStreak: next.rateLimitStreak,
      chainToken: next.chainToken,
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
    await response.text().catch(() => '');
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
  chainToken?: string;
  scheduleNext?: (next: {
    chain: number;
    rateLimitStreak: number;
    delayMs: number;
    chainToken: string;
  }) => Promise<void>;
} = {}): Promise<StorageProvisionBatchResult & { readonly continued: boolean }> {
  const chain = input.chain ?? 0;
  let rateLimitStreak = input.rateLimitStreak ?? 0;
  const chainToken =
    typeof input.chainToken === 'string' && input.chainToken.length > 0
      ? input.chainToken
      : crypto.randomUUID();
  const scheduleNext = input.scheduleNext ?? scheduleStorageProvisionNext;
  const heldOrganizations = new Set<string>();
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

  const totals = { clientsProcessed: 0, projectsProcessed: 0 };
  let activeConnection: { organizationId: string; id: string } | null = null;

  const releaseHeldLeases = async () => {
    for (const organizationId of heldOrganizations) {
      await releaseStorageProvisionLease(db, organizationId, chainToken);
    }
    heldOrganizations.clear();
  };

  connectionLoop: for (const row of connections) {
    try {
      const lease = await acquireStorageProvisionLease(db, row.organizationId, chainToken);
      if (!lease.acquired) {
        console.info('[org-storage/provision] skip org — chain lease held', {
          organizationId: row.organizationId,
          chain,
        });
        continue;
      }
      heldOrganizations.add(row.organizationId);
      let stoppedForNoProgress = false;

      const connection = await findStorageConnectionById(db, row.organizationId, row.id);
      if (!connection) {
        await releaseStorageProvisionLease(db, row.organizationId, chainToken);
        heldOrganizations.delete(row.organizationId);
        continue;
      }
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

      activeConnection = { organizationId: row.organizationId, id: row.id };
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
        if (last.remaining <= 0) {
          // This organization is complete — continue to the next connected provider.
          // Previously `break connectionLoop` left secondary orgs stuck at 0/N forever
          // whenever a primary (e.g. Google Drive) finished first.
          await releaseStorageProvisionLease(db, row.organizationId, chainToken);
          heldOrganizations.delete(row.organizationId);
          break;
        }

        if (last.clientsProcessed === 0 && last.projectsProcessed === 0) {
          // No progress. Stop this organization for this chain. Do not schedule
          // another hop, and do not mark the remaining folders complete.
          console.info('[org-storage/provision] zero progress — stop org chain', {
            organizationId: row.organizationId,
            remaining: last.remaining,
            chain,
          });
          await releaseStorageProvisionLease(db, row.organizationId, chainToken);
          heldOrganizations.delete(row.organizationId);
          activeConnection = null;
          stoppedForNoProgress = true;
          break;
        }

        if (last.rateLimited) {
          rateLimitStreak += 1;
          const step = nextStorageProvisionStep({
            remaining: last.remaining,
            rateLimited: true,
            chain,
            rateLimitStreak: rateLimitStreak - 1,
          });
          if (step.deferred) break connectionLoop;
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
      }

      if (stoppedForNoProgress) {
        activeConnection = null;
        continue;
      }
      if (last.remaining > 0 || last.rateLimited) break connectionLoop;
      activeConnection = null;
    } catch (error) {
      if (isTransient(error)) {
        last = { ...last, remaining: 1, rateLimited: true };
        break connectionLoop;
      }
      const fatal = nonRetryableMessage(error);
      if (fatal) {
        await updateStorageConnection(db, row.organizationId, row.id, { lastError: fatal });
        last = { ...last, remaining: 1, rateLimited: false, fatalError: fatal };
        break connectionLoop;
      }
      const detail = error instanceof Error ? error.message : String(error);
      const persisted = `provision_failed: ${detail}`.slice(0, 500);
      console.error('[org-storage/provision] connection provision_failed', {
        connectionId: row.id,
        detail,
      });
      await updateStorageConnection(db, row.organizationId, row.id, {
        lastError: persisted,
      });
      last = {
        ...last,
        remaining: Math.max(last.remaining, 1),
        rateLimited: false,
        fatalError: persisted,
      };
      break connectionLoop;
    }
  }

  last = {
    ...last,
    clientsProcessed: totals.clientsProcessed,
    projectsProcessed: totals.projectsProcessed,
  };

  const decision = shouldScheduleStorageProvisionHop({
    clientsProcessed: last.clientsProcessed,
    projectsProcessed: last.projectsProcessed,
    remaining: last.remaining,
    rateLimited: last.rateLimited,
    fatalError: last.fatalError,
    chain,
    rateLimitStreak,
  });

  if (last.fatalError) {
    console.error('[org-storage/provision] cycle stopped — non-retryable', {
      chain,
      fatalError: last.fatalError,
    });
  }

  if (!decision.schedule) {
    if (decision.step.deferred && last.remaining > 0 && activeConnection) {
      await updateStorageConnection(db, activeConnection.organizationId, activeConnection.id, {
        lastError: STORAGE_PROVISION_CHAIN_DEFERRED_ERROR,
      });
      console.error('[org-storage/provision] chain cap — remaining work deferred for a later worker resume', {
        chain: decision.step.chain,
        remaining: last.remaining,
        connectionId: activeConnection.id,
      });
    }
    await releaseHeldLeases();
    return { ...last, continued: false };
  }

  await scheduleNext({
    chain: decision.step.chain,
    rateLimitStreak: decision.step.rateLimitStreak,
    delayMs: decision.step.delayMs,
    chainToken,
  });
  return { ...last, continued: true };
}
