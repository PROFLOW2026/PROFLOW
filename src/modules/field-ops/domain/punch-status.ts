import type { PunchStatus } from './types';

const TERMINAL: ReadonlySet<PunchStatus> = new Set(['done', 'cancelled']);

const TRANSITIONS: Readonly<Record<PunchStatus, readonly PunchStatus[]>> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: ['open'],
  cancelled: [],
};

export function isTerminalPunchStatus(status: PunchStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionPunchStatus(from: PunchStatus, to: PunchStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertPunchStatusTransition(from: PunchStatus, to: PunchStatus): void {
  if (!canTransitionPunchStatus(from, to)) {
    throw new Error(`Invalid punch list transition: ${from} → ${to}`);
  }
}

/** Closing a punch item records closedAt; reopening clears it. */
export function closedAtForPunchStatus(
  status: PunchStatus,
  now: Date = new Date(),
): Date | null {
  return status === 'done' ? now : null;
}
