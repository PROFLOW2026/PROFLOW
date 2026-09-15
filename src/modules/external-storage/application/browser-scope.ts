import type { StorageProviderAdapter } from '../domain/provider-interface';
import { DomainRuleError, NotFoundError } from '@/shared/errors';

const MAX_PARENT_WALK = 32;

/** Returns true when `folderId` is a direct descendant of `ancestorId` (or equal). */
export async function isFolderDescendantOf(
  adapter: StorageProviderAdapter,
  accessToken: string,
  folderId: string,
  ancestorId: string,
): Promise<boolean> {
  if (folderId === ancestorId) return true;
  let current = folderId;
  for (let depth = 0; depth < MAX_PARENT_WALK; depth++) {
    const folder = await adapter.getFolder(accessToken, current);
    if (!folder?.parentId) return false;
    if (folder.parentId === ancestorId) return true;
    current = folder.parentId;
  }
  return false;
}

export async function assertFolderWithinProjectTree(
  adapter: StorageProviderAdapter,
  accessToken: string,
  folderId: string,
  projectRootFolderIds: ReadonlySet<string>,
): Promise<void> {
  if (projectRootFolderIds.has(folderId)) return;

  if (adapter.isFolderUnderRoots) {
    const underRoots = await adapter.isFolderUnderRoots(
      accessToken,
      folderId,
      projectRootFolderIds,
    );
    if (underRoots) return;
    throw new DomainRuleError(
      'Folder is outside project storage scope',
      'externalStorage.errors.outOfScope',
    );
  }

  let current = folderId;
  for (let depth = 0; depth < MAX_PARENT_WALK; depth++) {
    const folder = await adapter.getFolder(accessToken, current);
    if (!folder) {
      throw new NotFoundError('Folder');
    }
    if (!folder.parentId) break;
    if (projectRootFolderIds.has(folder.parentId)) return;
    current = folder.parentId;
  }

  throw new DomainRuleError(
    'Folder is outside project storage scope',
    'externalStorage.errors.outOfScope',
  );
}
