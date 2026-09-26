import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { projects, storageFiles, storageFolderMappings } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import {
  getOrganizationPrimaryStorage,
  organizationHasActiveStorage,
  resolveValidAccessToken,
} from './connection-service';
import { ensureClientFolderTree, ensureEmployeeFolderTree, ensureVendorFolderTree } from './folder-provisioning';
import { kickStorageProvision } from './kick-storage-provision';
import { isSemanticFolderCheckViolation } from './semantic-constraint';
import { PROJECT_INFO_FILE_NAME } from '../domain/project-info-text';
import { provisionStoredProjectFolder } from './project-provision';

/** Non-blocking: business entity creation must not roll back on folder failure. */
export async function provisionClientStorageFolder(
  context: OrgContext,
  clientId: string,
  clientName: string,
): Promise<void> {
  try {
    const connection = await getOrganizationPrimaryStorage(context);
    if (!organizationHasActiveStorage(connection)) return;
    const { connectionTemplateApproved, reconcileProjectTemplateGateState } = await import(
      './project-template-service'
    );
    const gated = await reconcileProjectTemplateGateState(
      context.db,
      context.organizationId,
      connection!,
    );
    if (!connectionTemplateApproved(gated)) return;
    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, gated);
    await ensureClientFolderTree(context.db, {
      organizationId: context.organizationId,
      connection: gated,
      accessToken,
      clientId,
      clientName,
    });
  } catch {
    kickStorageProvision();
  }
}

async function withApprovedPrimaryStorage(
  context: OrgContext,
  run: (input: {
    connection: NonNullable<Awaited<ReturnType<typeof getOrganizationPrimaryStorage>>>;
    accessToken: string;
  }) => Promise<unknown>,
): Promise<void> {
  const connection = await getOrganizationPrimaryStorage(context);
  if (!organizationHasActiveStorage(connection)) return;
  const { connectionTemplateApproved, reconcileProjectTemplateGateState } = await import(
    './project-template-service'
  );
  const gated = await reconcileProjectTemplateGateState(
    context.db,
    context.organizationId,
    connection!,
  );
  if (!connectionTemplateApproved(gated)) return;
  const accessToken = await resolveValidAccessToken(context.db, context.organizationId, gated);
  await run({ connection: gated, accessToken });
}

function logPartyFolderFailure(
  kind: 'vendor' | 'employee',
  organizationId: string,
  entityId: string,
  error: unknown,
): void {
  console.error(`[org-storage/provision] ${kind} folder failed`, {
    organizationId,
    ...(kind === 'vendor' ? { vendorId: entityId } : { employeeId: entityId }),
    detail: error instanceof Error ? error.message : String(error),
  });
}

/** Non-blocking. A semantic check failure is logged and does not retry until migration 0130 is applied. */
export async function provisionVendorStorageFolder(
  context: OrgContext,
  vendorId: string,
  vendorName: string,
): Promise<void> {
  try {
    await withApprovedPrimaryStorage(context, ({ connection, accessToken }) =>
      ensureVendorFolderTree(context.db, {
        organizationId: context.organizationId,
        connection,
        accessToken,
        vendorId,
        vendorName,
      }),
    );
  } catch (error) {
    logPartyFolderFailure('vendor', context.organizationId, vendorId, error);
    if (!isSemanticFolderCheckViolation(error)) kickStorageProvision();
  }
}

/** Non-blocking. A semantic check failure is logged and does not retry until migration 0130 is applied. */
export async function provisionEmployeeStorageFolder(
  context: OrgContext,
  employeeId: string,
  employeeName: string,
): Promise<void> {
  try {
    await withApprovedPrimaryStorage(context, ({ connection, accessToken }) =>
      ensureEmployeeFolderTree(context.db, {
        organizationId: context.organizationId,
        connection,
        accessToken,
        employeeId,
        employeeName,
      }),
    );
  } catch (error) {
    logPartyFolderFailure('employee', context.organizationId, employeeId, error);
    if (!isSemanticFolderCheckViolation(error)) kickStorageProvision();
  }
}

export async function provisionProjectStorageFolder(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  try {
    const connection = await getOrganizationPrimaryStorage(context);
    if (!organizationHasActiveStorage(connection)) return;
    const { connectionTemplateApproved, reconcileProjectTemplateGateState } = await import(
      './project-template-service'
    );
    const gated = await reconcileProjectTemplateGateState(
      context.db,
      context.organizationId,
      connection!,
    );
    if (!connectionTemplateApproved(gated)) return;
    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, gated);
    await provisionStoredProjectFolder(context.db, {
      organizationId: context.organizationId,
      connection: gated,
      accessToken,
      projectId,
    });
  } catch {
    kickStorageProvision();
  }
}

/** Client detail changes should refresh each related project info file on the next batch. */
export async function refreshClientStorageAfterChange(
  context: OrgContext,
  clientId: string,
  clientName: string,
): Promise<void> {
  try {
    await provisionClientStorageFolder(context, clientId, clientName);
    const connection = await getOrganizationPrimaryStorage(context);
    if (!organizationHasActiveStorage(connection)) return;
    const roots = await context.db
      .select({ folderId: storageFolderMappings.externalFolderId })
      .from(storageFolderMappings)
      .innerJoin(projects, eq(projects.id, storageFolderMappings.entityId))
      .where(
        and(
          eq(projects.organizationId, context.organizationId),
          eq(projects.clientId, clientId),
          eq(storageFolderMappings.connectionId, connection!.id),
          eq(storageFolderMappings.semanticFolderType, 'project_root'),
        ),
      );
    const folderIds = roots.map((row) => row.folderId).filter((id) => id && id !== 'pending');
    if (folderIds.length > 0) {
      await asServiceRoleWrite(context.db, async () => {
        await context.db
          .update(storageFiles)
          .set({ status: 'pending', updatedAt: new Date() })
          .where(
            and(
              eq(storageFiles.organizationId, context.organizationId),
              eq(storageFiles.connectionId, connection!.id),
              eq(storageFiles.originalFilename, PROJECT_INFO_FILE_NAME),
              inArray(storageFiles.externalParentFolderId, folderIds),
            ),
          );
      });
    }
    kickStorageProvision();
  } catch {
    kickStorageProvision();
  }
}
