import { PROJECT_STATUSES, type ProjectStatus } from './types';

/**
 * Soft-archive / restore for projects & jobs.
 *
 * Archive sets status=`archived` + archivedAt.
 * Restore clears archivedAt and returns the pre-archive status when the
 * archive audit `before` payload holds a valid project status other than
 * `archived`. Missing, invalid, or `archived` falls back to `active`.
 */

const RESTORABLE_PROJECT_STATUSES: ReadonlySet<string> = new Set(
  PROJECT_STATUSES.filter((status) => status !== 'archived'),
);

function readArchiveBeforeStatus(before: unknown): unknown {
  if (before === null || typeof before !== 'object' || Array.isArray(before)) return undefined;
  if (!('status' in before)) return undefined;
  return (before as { readonly status?: unknown }).status;
}

/** Pre-archive status for restore. Anything other than a live project status becomes `active`. */
export function resolveRestoredProjectStatus(before: unknown): ProjectStatus {
  const status = readArchiveBeforeStatus(before);
  if (typeof status === 'string' && RESTORABLE_PROJECT_STATUSES.has(status)) {
    return status as ProjectStatus;
  }
  return 'active';
}

export function buildProjectArchivePatch(now: Date = new Date()) {
  return {
    status: 'archived' as const satisfies ProjectStatus,
    archivedAt: now,
  };
}

export function buildProjectRestorePatch(before?: unknown) {
  return {
    status: resolveRestoredProjectStatus(before),
    archivedAt: null,
  };
}

export function isProjectSoftArchived(record: {
  readonly status: ProjectStatus;
  readonly archivedAt: Date | null;
}): boolean {
  return record.archivedAt != null || record.status === 'archived';
}

/** True when the row is closed by work outcome, not soft-archived. */
export function isProjectLifecycleClosed(status: ProjectStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}
