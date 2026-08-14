import { describe, expect, it } from 'vitest';
import {
  decodeStorageOrphanChecksum,
  encodeStorageOrphanChecksum,
  isStorageOrphanChecksum,
  needsStorageCleanupRetry,
  removeStorageObjectWithRetry,
  restoreChecksumIfOrphanEncoded,
  STORAGE_ORPHAN_CHECKSUM_PREFIX,
  truncateStorageCleanupError,
} from '@/modules/documents/domain/storage-cleanup';

describe('document storage cleanup helpers', () => {
  it('restores the original checksum suffix after the orphan prefix', () => {
    const flagged = encodeStorageOrphanChecksum('abc123');
    expect(flagged.startsWith(STORAGE_ORPHAN_CHECKSUM_PREFIX)).toBe(true);
    expect(isStorageOrphanChecksum(flagged)).toBe(true);
    expect(decodeStorageOrphanChecksum(flagged)).toBe('abc123');
    expect(restoreChecksumIfOrphanEncoded(flagged)).toBe('abc123');
  });

  it('restores a null original from an empty suffix', () => {
    const flagged = encodeStorageOrphanChecksum(null);
    expect(isStorageOrphanChecksum(flagged)).toBe(true);
    expect(decodeStorageOrphanChecksum(flagged)).toBeNull();
    expect(restoreChecksumIfOrphanEncoded(flagged)).toBeNull();
  });

  it('leaves a real checksum unchanged', () => {
    expect(restoreChecksumIfOrphanEncoded('deadbeef')).toBe('deadbeef');
    expect(restoreChecksumIfOrphanEncoded(null)).toBeNull();
  });

  it('does not double-encode an existing orphan flag', () => {
    const flagged = encodeStorageOrphanChecksum('hash');
    expect(encodeStorageOrphanChecksum(flagged)).toBe(flagged);
  });

  it('lists deleted rows whose cleanup is failed or pending', () => {
    expect(needsStorageCleanupRetry({ status: 'deleted', storageCleanupStatus: 'failed' })).toBe(true);
    expect(needsStorageCleanupRetry({ status: 'deleted', storageCleanupStatus: 'pending' })).toBe(true);
    expect(needsStorageCleanupRetry({ status: 'deleted', storageCleanupStatus: 'succeeded' })).toBe(false);
    expect(needsStorageCleanupRetry({ status: 'deleted', storageCleanupStatus: null })).toBe(false);
    expect(needsStorageCleanupRetry({ status: 'available', storageCleanupStatus: 'failed' })).toBe(false);
  });

  it('truncates long cleanup errors', () => {
    const error = 'x'.repeat(1200);
    expect(truncateStorageCleanupError(error)).toHaveLength(1000);
  });

  it('retries remove until it succeeds', async () => {
    let calls = 0;
    const result = await removeStorageObjectWithRetry(async () => {
      calls += 1;
      if (calls < 2) throw new Error('transient');
    }, 'org/docs/id/file.jpg', 3);

    expect(result).toEqual({ ok: true, attempts: 2 });
    expect(calls).toBe(2);
  });

  it('returns the last error after exhausting retries', async () => {
    let calls = 0;
    const result = await removeStorageObjectWithRetry(async () => {
      calls += 1;
      throw new Error(`fail-${calls}`);
    }, 'org/docs/id/file.jpg', 3);

    expect(result).toEqual({ ok: false, attempts: 3, error: 'fail-3' });
    expect(calls).toBe(3);
  });
});
