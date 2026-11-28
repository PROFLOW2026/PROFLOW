export const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const UPLOAD_WINDOW_MS = 2 * 60 * 60 * 1000;
export const PART_SIZE = 4 * 1024 * 1024;
export const STREAM_LEASE_MS = 60 * 1000;

export const SESSION_STATUSES = [
  'uploading',
  'queued',
  'running',
  'ready',
  'reviewed',
  'failed',
  'cancelling',
  'cancelled',
  'expired',
  'purge_pending',
  'purged',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

const TERMINAL = new Set<SessionStatus>(['cancelled', 'expired', 'purged']);

export function isLiveStatus(status: SessionStatus): boolean {
  return !TERMINAL.has(status) && status !== 'purge_pending';
}

/** Access ends at expires_at. There is no extension. */
export function sessionReadable(input: {
  status: SessionStatus;
  expiresAt: Date;
  closedAt: Date | null;
  now: Date;
}): boolean {
  if (input.closedAt) return false;
  if (!isLiveStatus(input.status)) return false;
  return input.now.getTime() < input.expiresAt.getTime();
}

/**
 * Physical delete waits for close, cancel or expiry, for the upload window, and for every stream lease.
 * A finished worker is not enough. 5 minutes and 24 hours are not success guarantees.
 */
export function objectsReadyToDelete(input: {
  status: SessionStatus;
  closedAt: Date | null;
  expiresAt: Date;
  uploadWindowEndsAt: Date;
  newestStreamLeaseUntil: Date | null;
  now: Date;
}): boolean {
  const ended =
    input.closedAt !== null ||
    input.status === 'cancelled' ||
    input.status === 'expired' ||
    input.status === 'purge_pending' ||
    input.now.getTime() >= input.expiresAt.getTime();
  if (!ended) return false;
  if (input.now.getTime() < input.uploadWindowEndsAt.getTime()) return false;
  if (input.newestStreamLeaseUntil && input.newestStreamLeaseUntil.getTime() > input.now.getTime()) return false;
  return input.status !== 'purged';
}

export function nextStatusAfterTerminal(outcome: 'ready' | 'failed'): SessionStatus {
  return outcome;
}

/** A later edit removes the temporary approval so the next export shows the draft banner again. */
export function statusAfterEdit(status: SessionStatus): SessionStatus {
  if (status === 'reviewed') return 'ready';
  return status;
}
