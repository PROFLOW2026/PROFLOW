import type { ProjectStatus } from './types';

/**
 * Soft-archive / restore for projects & jobs.
 *
 * Archive sets status=`archived` + archivedAt.
 * Restore nulls archivedAt and returns status to `active`.
 * Completed / cancelled are separate lifecycle states - not soft-archive.
 */

export function buildProjectArchivePatch(now: Date = new Date()) {
  return {
    status: 'archived' as const satisfies ProjectStatus,
    archivedAt: now,
  };
}

export function buildProjectRestorePatch() {
  return {
    status: 'active' as const satisfies ProjectStatus,
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
