/**
 * Soft-archive / restore patches for vendor master records.
 * Restore clears `archivedAt` (null) and returns status to active.
 */

export function buildVendorArchivePatch(now: Date = new Date()) {
  return {
    status: 'inactive' as const,
    archivedAt: now,
  };
}

export function buildVendorRestorePatch() {
  return {
    status: 'active' as const,
    archivedAt: null,
  };
}

export function isVendorSoftArchived(record: {
  readonly archivedAt: Date | null;
}): boolean {
  return record.archivedAt != null;
}
