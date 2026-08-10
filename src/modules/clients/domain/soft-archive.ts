/**
 * Soft-archive / restore patches for client master records.
 * Restore clears `archivedAt` (null) and returns status to active.
 */

export function buildClientArchivePatch(now: Date = new Date()) {
  return {
    status: 'inactive' as const,
    archivedAt: now,
  };
}

export function buildClientRestorePatch() {
  return {
    status: 'active' as const,
    archivedAt: null,
  };
}

export function isClientSoftArchived(record: {
  readonly archivedAt: Date | null;
  readonly status?: string;
}): boolean {
  return record.archivedAt != null;
}
