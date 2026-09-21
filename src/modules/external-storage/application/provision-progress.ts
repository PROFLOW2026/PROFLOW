import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { clients, projects, storageFolderMappings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { StorageProvisionProgress } from '../domain/project-folder-placement';
import { PROJECT_INFO_FILE_NAME, CLIENT_INFO_FILE_NAME } from '../domain/project-info-text';

const PROJECT_CHILD_COUNT = 8;

export async function loadStorageProvisionProgress(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<StorageProvisionProgress> {
  const roots = await db
    .select({
      semantic: storageFolderMappings.semanticFolderType,
      externalFolderId: storageFolderMappings.externalFolderId,
    })
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, organizationId),
        eq(storageFolderMappings.connectionId, connectionId),
        sql`${storageFolderMappings.semanticFolderType} in ('clients_root', 'projects_root')`,
        eq(storageFolderMappings.status, 'ready'),
      ),
    );
  const clientsRootId = roots.find((row) => row.semantic === 'clients_root')?.externalFolderId ?? null;
  const projectsRootId = roots.find((row) => row.semantic === 'projects_root')?.externalFolderId ?? null;

  const [clientTotal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clients)
    .where(and(eq(clients.organizationId, organizationId), isNull(clients.archivedAt)));
  const [projectTotal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)));

  const clientsTotal = clientTotal?.n ?? 0;
  const projectsTotal = projectTotal?.n ?? 0;

  const [clientDone] = clientsRootId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, organizationId),
            isNull(clients.archivedAt),
            sql`exists (
              select 1 from public.storage_folder_mappings m
              where m.organization_id = ${clients.organizationId}
                and m.connection_id = ${connectionId}::uuid
                and m.semantic_folder_type = 'client_root'
                and m.entity_id = ${clients.id}
                and m.status = 'ready'
                and m.external_parent_id = ${clientsRootId}
                and exists (
                  select 1 from public.storage_files file
                  where file.connection_id = m.connection_id
                    and file.external_parent_folder_id = m.external_folder_id
                    and file.original_filename = ${CLIENT_INFO_FILE_NAME}
                    and file.status = 'synced'
                )
            )`,
          ),
        )
    : [{ n: 0 }];

  const [projectDone] = projectsRootId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, organizationId),
            isNull(projects.archivedAt),
            sql`exists (
              select 1 from public.storage_folder_mappings root
              where root.organization_id = ${projects.organizationId}
                and root.connection_id = ${connectionId}::uuid
                and root.entity_id = ${projects.id}
                and root.semantic_folder_type = 'project_root'
                and root.status = 'ready'
                and root.external_parent_id = ${projectsRootId}
                and (
                  select count(*)::int from public.storage_folder_mappings child
                  where child.connection_id = root.connection_id
                    and child.entity_id = root.entity_id
                    and child.status = 'ready'
                    and child.external_parent_id = root.external_folder_id
                    and child.semantic_folder_type in (
                      'quotes','contracts','billing','vendor_invoices','plans','photos','documents','general_files'
                    )
                ) = ${PROJECT_CHILD_COUNT}
                and exists (
                  select 1 from public.storage_files file
                  where file.connection_id = root.connection_id
                    and file.external_parent_folder_id = root.external_folder_id
                    and file.original_filename = ${PROJECT_INFO_FILE_NAME}
                    and file.status = 'synced'
                )
            )`,
          ),
        )
    : [{ n: 0 }];

  const [folderDone] = projectsRootId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(storageFolderMappings)
        .where(
          and(
            eq(storageFolderMappings.organizationId, organizationId),
            eq(storageFolderMappings.connectionId, connectionId),
            eq(storageFolderMappings.status, 'ready'),
            sql`${storageFolderMappings.semanticFolderType} in (
              'quotes','contracts','billing','vendor_invoices','plans','photos','documents','general_files'
            )`,
            sql`exists (
              select 1 from public.storage_folder_mappings root
              where root.organization_id = ${storageFolderMappings.organizationId}
                and root.connection_id = ${storageFolderMappings.connectionId}
                and root.entity_id = ${storageFolderMappings.entityId}
                and root.semantic_folder_type = 'project_root'
                and root.status = 'ready'
                and root.external_parent_id = ${projectsRootId}
                and root.external_folder_id = ${storageFolderMappings.externalParentId}
            )`,
            sql`exists (
              select 1 from public.projects p
              where p.id = ${storageFolderMappings.entityId}
                and p.organization_id = ${organizationId}::uuid
                and p.archived_at is null
            )`,
          ),
        )
    : [{ n: 0 }];

  const clientsProvisioned = clientDone?.n ?? 0;
  const projectsProvisioned = projectDone?.n ?? 0;
  const projectFoldersProvisioned = folderDone?.n ?? 0;
  const projectFoldersTotal = projectsTotal * PROJECT_CHILD_COUNT;
  const ready =
    Boolean(clientsRootId) &&
    Boolean(projectsRootId) &&
    clientsProvisioned >= clientsTotal &&
    projectsProvisioned >= projectsTotal;

  return {
    clientsTotal,
    clientsProvisioned,
    projectsTotal,
    projectsProvisioned,
    projectFoldersTotal,
    projectFoldersProvisioned,
    state: ready ? 'ready' : 'preparing',
  };
}
