import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import {
  browseProjectStorageFolder,
  getProjectStorageBrowserContext,
  loadProjectFileBrowserInitial,
  type ProjectFileBrowserInitialLoad,
} from '@/modules/external-storage/application/browser-service';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { filterTakeoffSourceCloudFiles } from '../domain/takeoff-source-file-filter';

function assertTakeoffCloudBrowse(context: OrgContext): void {
  assertAnyPermission(context, [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.TAKEOFF_MANAGE]);
}

export type TakeoffCloudBrowserInitialLoad = ProjectFileBrowserInitialLoad;

export async function loadTakeoffSourceBrowserInitial(
  context: OrgContext,
  projectId: string,
): Promise<TakeoffCloudBrowserInitialLoad> {
  assertTakeoffCloudBrowse(context);
  const browserContext = await getProjectStorageBrowserContext(context, projectId);
  const plans = browserContext.semanticShortcuts.find((s) => s.semanticFolderType === 'plans');
  if (plans) {
    const listing = await browseProjectStorageFolder(context, {
      projectId,
      folderExternalId: plans.externalFolderId,
      folderName: plans.displayName,
    });
    return {
      context: browserContext,
      folderExternalId: listing.folderExternalId,
      folderName: listing.folderName,
      folders: listing.listing.folders,
      files: filterTakeoffSourceCloudFiles(listing.listing.files),
    };
  }
  const fallback = await loadProjectFileBrowserInitial(context, projectId);
  return {
    ...fallback,
    files: filterTakeoffSourceCloudFiles(fallback.files),
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
  folders: TakeoffCloudBrowserInitialLoad['folders'];
  files: TakeoffCloudBrowserInitialLoad['files'];
}> {
  assertTakeoffCloudBrowse(context);
  const listing = await browseProjectStorageFolder(context, input);
  return {
    folderExternalId: listing.folderExternalId,
    folderName: listing.folderName,
    projectRootFolderId: listing.projectRootFolderId,
    folders: listing.listing.folders,
    files: filterTakeoffSourceCloudFiles(listing.listing.files),
  };
}