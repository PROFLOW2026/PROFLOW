import type { InspectionStatus } from './types';

const TERMINAL: ReadonlySet<InspectionStatus> = new Set(['passed', 'failed', 'cancelled']);

const TRANSITIONS: Readonly<Record<InspectionStatus, readonly InspectionStatus[]>> = {
  scheduled: ['in_progress', 'passed', 'failed', 'cancelled'],
  in_progress: ['passed', 'failed', 'cancelled', 'scheduled'],
  passed: [],
  failed: [],
  cancelled: [],
};

export function isTerminalInspectionStatus(status: InspectionStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionInspectionStatus(
  from: InspectionStatus,
  to: InspectionStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertInspectionStatusTransition(
  from: InspectionStatus,
  to: InspectionStatus,
): void {
  if (!canTransitionInspectionStatus(from, to)) {
    throw new Error(`Invalid inspection transition: ${from} → ${to}`);
  }
}

export function isCompletedInspectionStatus(status: InspectionStatus): boolean {
  return status === 'passed' || status === 'failed';
}
