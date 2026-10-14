import type { ProviderFolderItem } from './types';
import type { FolderMappingRecord } from './types';

/** Hide orphan cloud duplicates of managed project folders; keep DB-canonical ids only. */
export function dedupeProjectRootManagedFolders(
  folders: readonly ProviderFolderItem[],
  mappings: readonly FolderMappingRecord[],
  isProjectSemanticFolderType: (type: string) => boolean,
): ProviderFolderItem[] {
  const canonicalIdByName = new Map<string, string>();
  for (const mapping of mappings) {
    if (mapping.status !== 'ready' || !isProjectSemanticFolderType(mapping.semanticFolderType)) {
      continue;
    }
    canonicalIdByName.set(mapping.displayName, mapping.externalFolderId);
  }

  return folders.filter((folder) => {
    const canonicalId = canonicalIdByName.get(folder.name);
    if (canonicalId === undefined) return true;
    return folder.id === canonicalId;
  });
}
