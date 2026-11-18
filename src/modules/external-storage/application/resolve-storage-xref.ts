import 'server-only';

import { resolveXrefInFolder, type XrefWalkListing } from '../domain/xref-folder-walk';
import type { StorageProviderAdapter } from '../domain/provider-interface';

export type ResolvedStorageXref = {
  fileId: string;
  name: string;
  parentFolderId: string;
  sizeBytes: number | null;
};

/**
 * Walk one saved XREF path from the folder of the file that references it.
 * The same walk is used by every storage provider. A missing file, a refused
 * path, or a provider error returns null so the host drawing stays open.
 */
export async function resolveStorageXrefPath(input: {
  adapter: StorageProviderAdapter;
  accessToken: string;
  startFolderId: string;
  xrefPath: string;
  anchorPath?: string | null;
}): Promise<ResolvedStorageXref | null> {
  const xrefPath = input.xrefPath.trim();
  if (xrefPath.length < 1 || xrefPath.length > 500) return null;
  try {
    const listFolder = async (folderId: string): Promise<XrefWalkListing> => {
      const listing = await input.adapter.listFolder(input.accessToken, folderId);
      return {
        files: listing.files.map((file) => ({
          id: file.id,
          name: file.name,
          kind: 'file' as const,
          sizeBytes: file.sizeBytes,
          parentId: file.parentId,
        })),
        folders: listing.folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          kind: 'folder' as const,
          parentId: folder.parentId,
        })),
      };
    };
    const parentOf = async (folderId: string) =>
      (await input.adapter.getFolder(input.accessToken, folderId))?.parentId ?? null;

    let startFolderId = input.startFolderId;
    let rootFolderId = await connectionRoot(parentOf, startFolderId);
    const anchorPath = input.anchorPath?.trim();
    if (anchorPath) {
      const anchor = await resolveXrefInFolder({
        startFolderId,
        rootFolderId,
        xrefPath: anchorPath,
        listFolder,
        parentOf,
      });
      if (anchor.status !== 'found') return null;
      startFolderId = anchor.folderId;
      rootFolderId = await connectionRoot(parentOf, startFolderId);
    }
    const found = await resolveXrefInFolder({
      startFolderId,
      rootFolderId,
      xrefPath,
      listFolder,
      parentOf,
    });
    if (found.status !== 'found') return null;
    return {
      fileId: found.file.id,
      name: found.file.name,
      parentFolderId: found.folderId,
      sizeBytes: found.file.sizeBytes ?? null,
    };
  } catch {
    return null;
  }
}

async function connectionRoot(
  parentOf: (folderId: string) => Promise<string | null>,
  startFolderId: string,
): Promise<string> {
  let current = startFolderId;
  for (let step = 0; step < 40; step += 1) {
    const parent = await parentOf(current);
    if (!parent || parent === current) return current;
    current = parent;
  }
  return startFolderId;
}
