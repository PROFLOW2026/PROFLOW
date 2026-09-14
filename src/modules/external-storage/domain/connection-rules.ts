import type { StorageConnectionRecord } from './types';

/** Connected storage that can serve uploads (root folder provisioned). */
export function isUsableStorageConnection(connection: StorageConnectionRecord | null): boolean {
  return connection?.status === 'connected' && Boolean(connection.rootFolderExternalId);
}

/**
 * Whether a successful OAuth completion should promote this connection to primary.
 * First usable provider, or replacement when the current primary is not usable.
 */
export function shouldPromoteConnectedStorageToPrimary(
  existingPrimary: StorageConnectionRecord | null,
): boolean {
  return !isUsableStorageConnection(existingPrimary);
}
