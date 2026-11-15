import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import {
  assertFolderUnderActiveConnectionSemanticFolder,
  browseProjectStorageFolder,
  getActiveConnectionSemanticFolder,
  type ProjectFileBrowserInitialLoad,
} from '@/modules/external-storage/application/browser-service';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { filterTakeoffSourceCloudFiles } from '../domain/takeoff-source-file-filter';

function assertTakeoffCloudBrowse(context: OrgContext): void {
  assertAnyPermission(context, [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.TAKEOFF_MANAGE]);
}

export type TakeoffCloudBrowserInitialLoad = ProjectFileBrowserInitialLoad & {
  readonly plansRootFolderId: string;
};

export async function loadTakeoffSourceBrowserInitial(
  context: OrgContext,
  projectId: string,
): Promise<TakeoffCloudBrowserInitialLoad> {
  assertTakeoffCloudBrowse(context);
  const plans = await getActiveConnectionSemanticFolder(context, projectId, 'plans');
  const listing = await browseProjectStorageFolder(context, {
    projectId,
    folderExternalId: plans.externalFolderId,
    folderName: plans.displayName,
  });
  return {
    context: {
      ...plans.browserContext,
      semanticShortcuts: plans.browserContext.semanticShortcuts.filter(
        (shortcut) => shortcut.semanticFolderType === 'plans',
      ),
    },
    folderExternalId: listing.folderExternalId,
    folderName: listing.folderName,
    plansRootFolderId: plans.externalFolderId,
    folders: listing.listing.folders,
    files: filterTakeoffSourceCloudFiles(listing.listing.files),
  };
}

export async function browseTakeoffSourceFolder(
  context: OrgContext,
  input: {
    projectId: string;
    folderExternalId?: string | null;
    folderName?: string | null;
  },
): Promise<{
  folderExternalId: string;
  folderName: string;
  projectRootFolderId: string;
  plansRootFolderId: string;
  folders: TakeoffCloudBrowserInitialLoad['folders'];
  files: TakeoffCloudBrowserInitialLoad['files'];
}> {
  assertTakeoffCloudBrowse(context);
  const plans = await getActiveConnectionSemanticFolder(context, input.projectId, 'plans');
  const folderExternalId = input.folderExternalId?.trim() || plans.externalFolderId;
  await assertFolderUnderActiveConnectionSemanticFolder(
    context,
    input.projectId,
    folderExternalId,
    'plans',
  );
  const listing = await browseProjectStorageFolder(context, {
    projectId: input.projectId,
    folderExternalId,
    folderName: input.folderName,
  });
  return {
    folderExternalId: listing.folderExternalId,
    folderName: listing.folderName,
    projectRootFolderId: plans.externalFolderId,
    plansRootFolderId: plans.externalFolderId,
    folders: listing.listing.folders,
    files: filterTakeoffSourceCloudFiles(listing.listing.files),
  };
}