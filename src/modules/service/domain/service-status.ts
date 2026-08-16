import type { ProjectStatus } from '@/modules/projects/domain/types';
import type { ServiceStatus } from './types';
import { SERVICE_STATUSES } from './types';

const TERMINAL: ReadonlySet<ServiceStatus> = new Set(['completed', 'cancelled']);

/** Allowed service lifecycle transitions (lightweight - no forced workflow engine). */
const ALLOWED: Readonly<Record<ServiceStatus, readonly ServiceStatus[]>> = {
  new: ['scheduled', 'in_progress', 'waiting', 'cancelled'],
  scheduled: ['in_progress', 'waiting', 'completed', 'cancelled', 'new'],
  in_progress: ['waiting', 'completed', 'cancelled', 'scheduled'],
  waiting: ['in_progress', 'scheduled', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isServiceStatus(value: string): value is ServiceStatus {
  return (SERVICE_STATUSES as readonly string[]).includes(value);
}

export function isTerminalServiceStatus(status: ServiceStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionServiceStatus(from: ServiceStatus, to: ServiceStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

/**
 * Keep project.status roughly aligned with service lifecycle so shared list
 * facets stay useful. Does not invent financial Actual.
 */
export function projectStatusForServiceStatus(status: ServiceStatus): ProjectStatus {
  switch (status) {
    case 'new':
      return 'draft';
    case 'scheduled':
    case 'in_progress':
    case 'waiting':
      return 'active';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
  }
}
