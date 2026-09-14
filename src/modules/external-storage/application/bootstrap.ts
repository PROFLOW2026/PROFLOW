import 'server-only';

import { eq } from 'drizzle-orm';
import { clients, projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { findStorageConnectionById } from '../data/connections.repository';
import { ProviderHttpError } from '../providers/http-utils';
import { ensureClientFolderTree, ensureProjectFolderTree } from './folder-provisioning';

function bootstrapErrorDetail(error: unknown): string {
  if (error instanceof ProviderHttpError) {
    return `${error.message} ${error.bodySnippet}`.slice(0, 500);
  }
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

/** Idempotently provision folders for existing clients and projects. */
export async function bootstrapOrganizationStorageTree(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  accessToken: string,
): Promise<{ clients: number; projects: number }> {
  const connection = await findStorageConnectionById(db, organizationId, connectionId);
  if (!connection) return { clients: 0, projects: 0 };

  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.organizationId, organizationId));

  let clientCount = 0;
  for (const client of clientRows) {
    try {
      await ensureClientFolderTree(db, {
        organizationId,
        connection,
        accessToken,
        clientId: client.id,
        clientName: client.name,
      });
      clientCount += 1;
    } catch (error) {
      console.error('[org-storage/bootstrap] client folder failed', {
        organizationId,
        clientId: client.id,
        detail: bootstrapErrorDetail(error),
      });
    }
  }

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));

  const clientNameById = new Map(clientRows.map((c) => [c.id, c.name]));
  let projectCount = 0;
  for (const project of projectRows) {
    if (!project.clientId) continue;
    const clientName = clientNameById.get(project.clientId) ?? 'Client';
    try {
      await ensureProjectFolderTree(db, {
        organizationId,
        connection,
        accessToken,
        clientId: project.clientId,
        clientName,
        projectId: project.id,
        projectName: project.name,
      });
      projectCount += 1;
    } catch (error) {
      console.error('[org-storage/bootstrap] project folder failed', {
        organizationId,
        projectId: project.id,
        detail: bootstrapErrorDetail(error),
      });
    }
  }

  return { clients: clientCount, projects: projectCount };
}
