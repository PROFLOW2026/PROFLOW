/**
 * Durable storage-object cleanup helpers.
 *
 * Soft-delete is metadata-authoritative (`status=deleted`). Bytes are removed
 * best-effort with retries. Cleanup state lives on `documents.storage_cleanup_*`
 * (Lead 0041). The checksum prefix below is legacy only - never write it.
 */

export const STORAGE_CLEANUP_RETRY_ATTEMPTS = 3;

export const STORAGE_CLEANUP_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type StorageCleanupStatus = (typeof STORAGE_CLEANUP_STATUSES)[number];

export const STORAGE_CLEANUP_RETRY_STATUSES = ['failed', 'pending'] as const;
export type StorageCleanupRetryStatus = (typeof STORAGE_CLEANUP_RETRY_STATUSES)[number];

const STORAGE_CLEANUP_ERROR_MAX = 1000;

/** Legacy checksum prefix - not a file hash. Restored by 0041; do not encode new rows. */
export const STORAGE_ORPHAN_CHECKSUM_PREFIX = 'pf:storage-orphan';

export function isStorageCleanupStatus(
  value: string | null | undefined,
): value is StorageCleanupStatus {
  return value === 'pending' || value === 'succeeded' || value === 'failed';
}

export function needsStorageCleanupRetry(input: {
  readonly status: string;
  readonly storageCleanupStatus: string | null | undefined;
}): boolean {
  return (
    input.status === 'deleted' &&
    (input.storageCleanupStatus === 'failed' || input.storageCleanupStatus === 'pending')
  );
}

export function isStorageOrphanChecksum(checksum: string | null | undefined): boolean {
  return typeof checksum === 'string' && checksum.startsWith(STORAGE_ORPHAN_CHECKSUM_PREFIX);
}

/** Test/migration helper: reconstruct the interim flag. Application code must not persist this. */
export function encodeStorageOrphanChecksum(originalChecksum: string | null): string {
  if (isStorageOrphanChecksum(originalChecksum)) return originalChecksum!;
  return `${STORAGE_ORPHAN_CHECKSUM_PREFIX}:${originalChecksum ?? ''}`;
}

export function decodeStorageOrphanChecksum(checksum: string | null): string | null {
  if (!isStorageOrphanChecksum(checksum) || checksum == null) return checksum;
  const rest = checksum.slice(STORAGE_ORPHAN_CHECKSUM_PREFIX.length);
  if (!rest.startsWith(':')) return null;
  const original = rest.slice(1);
  return original.length > 0 ? original : null;
}

/** Restore a SHA-256 checksum if it still carries the interim orphan prefix. */
export function restoreChecksumIfOrphanEncoded(checksum: string | null): string | null {
  if (!isStorageOrphanChecksum(checksum)) return checksum;
  return decodeStorageOrphanChecksum(checksum);
}

export function truncateStorageCleanupError(error: string): string {
  if (error.length <= STORAGE_CLEANUP_ERROR_MAX) return error;
  return error.slice(0, STORAGE_CLEANUP_ERROR_MAX);
}

export type StorageRemoveRetryResult =
  | { readonly ok: true; readonly attempts: number }
  | { readonly ok: false; readonly attempts: number; readonly error: string };

export async function removeStorageObjectWithRetry(
  remove: (key: string) => Promise<void>,
  key: string,
  attempts = STORAGE_CLEANUP_RETRY_ATTEMPTS,
): Promise<StorageRemoveRetryResult> {
  const maxAttempts = Math.max(1, attempts);
  let lastError = 'unknown';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await remove(key);
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, attempts: maxAttempts, error: lastError };
}
