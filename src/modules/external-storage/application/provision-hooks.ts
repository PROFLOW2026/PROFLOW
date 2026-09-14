import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationPrimaryStorage,
  organizationHasActiveStorage,
} from './connection-service';
import { resolveValidAccessToken } from './connection-service';
import { ensureClientFolderTree, ensureProjectFolderTree } from './folder-provisioning';

/** Non-blocking: business entity creation must not roll back on folder failure. */
export async function provisionClientStorageFolder(
  context: OrgContext,
  clientId: string,
  clientName: string,
): Promise<void> {
  try {
    const connection = await getOrganizationPrimaryStorage(context);
    if (!organizationHasActiveStorage(connection)) return;
    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection!);
    await ensureClientFolderTree(context.db, {
      organizationId: context.organizationId,
      connection: connection!,
      accessToken,
      clientId,
      clientName,
    });
  } catch {
    // Mapping rows record error state for retry via bootstrap.
  }
}

export async function provisionProjectStorageFolder(
  context: OrgContext,
  input: { projectId: string; projectName: string; clientId: string; clientName: string },
): Promise<void> {
  try {
    const connection = await getOrganizationPrimaryStorage(context);
    if (!organizationHasActiveStorage(connection)) return;
    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection!);
    await ensureProjectFolderTree(context.db, {
      organizationId: context.organizationId,
      connection: connection!,
      accessToken,
      clientId: input.clientId,
      clientName: input.clientName,
      projectId: input.projectId,
      projectName: input.projectName,
    });
  } catch {
    // Non-blocking provisioning.
  }
}
