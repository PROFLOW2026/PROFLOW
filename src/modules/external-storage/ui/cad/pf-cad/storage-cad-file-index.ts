import type { ProviderFileItem } from '@/modules/external-storage/domain/types';
import type { StorageBrowserScope } from '@/modules/external-storage/client/storage-file-urls';
import { buildStorageFileDownloadUrl } from '@/modules/external-storage/client/storage-file-urls';
import { fetchStoragePreviewBytes } from '../fetch-storage-preview-bytes';
import { buildFileIndex, type CadIndexedFile, type FileIndex } from './xref-resolver';

/** Sibling files that may satisfy DWG XREF / font dependencies in the same folder listing. */
const CAD_SUPPORT_NAME = /\.(dwg|dxf|shx|pat|lin|ttf|otf)$/i;

const storageBytesCache = new Map<string, Promise<Uint8Array>>();

/** Dev/tests: drop cached preview bytes between harness runs. */
export function clearStorageCadBytesCache(): void {
  storageBytesCache.clear();
}

async function getCachedStorageBytes(
  cacheKey: string,
  fetch: () => Promise<ArrayBuffer>,
): Promise<Uint8Array> {
  let pending = storageBytesCache.get(cacheKey);
  if (!pending) {
    pending = fetch().then((buf) => new Uint8Array(buf));
    storageBytesCache.set(cacheKey, pending);
  }
  const bytes = await pending;
  return bytes;
}

export function isCadSupportSiblingFileName(fileName: string): boolean {
  return CAD_SUPPORT_NAME.test(fileName);
}

export function buildStorageCadFileIndex(input: {
  siblingFiles: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
}): FileIndex {
  const indexed: CadIndexedFile[] = input.siblingFiles
    .filter((item) => isCadSupportSiblingFileName(item.name))
    .map((item) => ({
      name: item.name,
      getBytes: async () => {
        const url = buildStorageFileDownloadUrl({
          scope: input.scope,
          fileId: item.id,
          projectId: input.projectId,
          disposition: 'inline',
        });
        return getCachedStorageBytes(item.id, () => fetchStoragePreviewBytes(url));
      },
    }));

  return buildFileIndex(indexed);
}
