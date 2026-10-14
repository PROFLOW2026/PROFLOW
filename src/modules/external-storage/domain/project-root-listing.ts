import { isProjectSemanticFolderType } from './semantic-folder-access';
import type { ProviderFolderItem, ProviderFolderListing } from './types';
import type { FolderMappingRecord } from './types';

function buildCanonicalIdByManagedName(
  mappings: readonly FolderMappingRecord[],
): Map<string, string> {
  const canonicalIdByName = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.status !== 'ready' || !isProjectSemanticFolderType(mapping.semanticFolderType)) {
      continue;
    }
    canonicalIdByName.set(mapping.displayName, mapping.externalFolderId);
  }
  return canonicalIdByName;
}

/** Hide empty orphan cloud duplicates of managed project folders; keep DB-canonical ids. */
export function dedupeProjectRootManagedFolders(
  folders: readonly ProviderFolderItem[],
  mappings: readonly FolderMappingRecord[],
): ProviderFolderItem[] {
  const canonicalIdByName = buildCanonicalIdByManagedName(mappings);

  return folders.filter((folder) => {
    const canonicalId = canonicalIdByName.get(folder.name);
    if (canonicalId === undefined) return true;
    return folder.id === canonicalId;
  });
}

/**
 * Same as {@link dedupeProjectRootManagedFolders}, but non-canonical managed-name folders
 * stay visible when they contain files or subfolders (no silent loss of documents).
 */
export async function dedupeProjectRootManagedFoldersPreservingContent(
  folders: readonly ProviderFolderItem[],
  mappings: readonly FolderMappingRecord[],
  listFolder: (folderId: string) => Promise<ProviderFolderListing>,
): Promise<ProviderFolderItem[]> {
  const canonicalIdByName = buildCanonicalIdByManagedName(mappings);
  const kept: ProviderFolderItem[] = [];
  const orphanManaged: ProviderFolderItem[] = [];

  for (const folder of folders) {
    const canonicalId = canonicalIdByName.get(folder.name);
    if (canonicalId === undefined || folder.id === canonicalId) {
      kept.push(folder);
      continue;
    }
    orphanManaged.push(folder);
  }

  await Promise.all(
    orphanManaged.map(async (folder) => {
      const inner = await listFolder(folder.id);
      if (inner.files.length > 0 || inner.folders.length > 0) {
        kept.push(folder);
      }
    }),
  );

  return kept;
}
