import type { ProjectStatus } from './types';

/** Visual status shape consumed by `<StatusBadge>` - kept in domain as a plain union. */
export type ProjectStatusShape =
  | 'draft'
  | 'active'
  | 'onHold'
  | 'completed'
  | 'cancelled'
  | 'archived';

/** Maps domain project status to the shared StatusBadge shape (doc 48 §1.7). */
export function projectStatusShape(status: ProjectStatus): ProjectStatusShape {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'active':
      return 'active';
    case 'on_hold':
      return 'onHold';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'archived':
      return 'archived';
    default:
      return 'draft';
  }
}

export function isArchivedStatus(status: ProjectStatus): boolean {
  return status === 'archived';
}
