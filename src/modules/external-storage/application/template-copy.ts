import 'server-only';

import { PROJECT_INFO_FILE_NAME } from '../domain/project-info-text';
import { sanitizeProviderFolderName } from '../domain/folder-names';
import type { ProviderFolderItem, StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function findDestChildFolder(
  accessToken: string,
  connection: StorageConnectionRecord,
  parentId: string,
  name: string,
): Promise<ProviderFolderItem | null> {
  const adapter = getStorageProviderAdapter(connection.provider);
  if (adapter.getChildFolderByName) {
    return adapter.getChildFolderByName(accessToken, parentId, name);
  }
  const listing = await adapter.listFolder(accessToken, parentId);
  return listing.folders.find((folder) => folder.name === name) ?? null;
}

/**
 * Recursively copies folders and files from a template folder into a destination.
 * Creates independent copies. Skips ProjectFlow's canonical project-info filename.
 * Idempotent: existing same-named children are reused, not duplicated.
 */
export async function copyProviderFolderContents(input: {
  connection: StorageConnectionRecord;
  accessToken: string;
  sourceFolderId: string;
  destinationFolderId: string;
}): Promise<void> {
  const adapter = getStorageProviderAdapter(input.connection.provider);
  const listing = await adapter.listFolder(input.accessToken, input.sourceFolderId);

  for (const folder of listing.folders) {
    const name = sanitizeProviderFolderName(folder.name);
    let dest = await findDestChildFolder(
      input.accessToken,
      input.connection,
      input.destinationFolderId,
      name,
    );
    if (!dest) {
      dest = await adapter.createFolder(input.accessToken, {
        name,
        parentId: input.destinationFolderId,
      });
    }
    await copyProviderFolderContents({
      connection: input.connection,
      accessToken: input.accessToken,
      sourceFolderId: folder.id,
      destinationFolderId: dest.id,
    });
  }

  for (const file of listing.files) {
    if (file.name === PROJECT_INFO_FILE_NAME) continue;
    const destListing = await adapter.listFolder(input.accessToken, input.destinationFolderId);
    if (destListing.files.some((row) => row.name === file.name)) continue;
    try {
      const downloaded = await adapter.downloadFileStream(input.accessToken, file.id, {
        knownMeta: file,
      });
      const body = await streamToUint8Array(downloaded.stream);
      await adapter.uploadFile(input.accessToken, {
        parentFolderId: input.destinationFolderId,
        fileName: file.name,
        mimeType: downloaded.mimeType || file.mimeType || 'application/octet-stream',
        body,
        sizeBytes: body.byteLength,
      });
    } catch {
      // Native cloud docs or transient provider limits must not block project creation.
    }
  }
}
