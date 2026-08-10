/**
 * Soft-archive / restore patches for employee master records.
 * Restore clears `archivedAt` (null) and returns status to active.
 * No hard delete when history exists — archive/inactive only.
 */

export function buildEmployeeArchivePatch(now: Date = new Date()) {
  return {
    status: 'inactive' as const,
    archivedAt: now,
  };
}

export function buildEmployeeRestorePatch() {
  return {
    status: 'active' as const,
    archivedAt: null,
  };
}

export function isEmployeeSoftArchived(record: {
  readonly archivedAt: Date | null;
}): boolean {
  return record.archivedAt != null;
}
