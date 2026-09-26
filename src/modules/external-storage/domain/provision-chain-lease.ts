import { nextStorageProvisionStep, type StorageProvisionStep } from './project-folder-placement';

/** Lease key stored on the organization's connected storage row. */
export const PROVISION_CHAIN_LEASE_KEY = 'provisionChainLease';

/**
 * Longer than one worker hop (240s of batches + up to 60s of provider backoff)
 * so a live chain keeps the row, and short enough that a crashed isolate
 * cannot block recovery.
 */
export const PROVISION_CHAIN_LEASE_TTL_MS = 8 * 60 * 1000;

export interface ProvisionChainLease {
  readonly token: string;
  readonly expiresAt: string;
}

export function readProvisionChainLease(value: unknown): ProvisionChainLease | null {
  if (!value || typeof value !== 'object') return null;
  const token = (value as { token?: unknown }).token;
  const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
  if (typeof token !== 'string' || token.length === 0) return null;
  if (typeof expiresAt !== 'string' || expiresAt.length === 0) return null;
  return { token, expiresAt };
}

/**
 * Same predicate the SQL acquire uses after the row lock:
 * missing, expired, or already ours. A different unexpired token loses.
 */
export function canAcquireProvisionLease(
  existing: ProvisionChainLease | null,
  now: Date,
  token: string,
): boolean {
  if (!existing) return true;
  const expiresAt = Date.parse(existing.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return true;
  return existing.token === token;
}

export function isProvisionLeaseHeld(
  existing: ProvisionChainLease | null,
  now: Date,
): boolean {
  if (!existing) return false;
  return !canAcquireProvisionLease(existing, now, '');
}

/**
 * Serial critical section with the same predicate as the database UPDATE.
 * Postgres row locks give the SQL path this ordering. Tests use this gate
 * to prove two overlapping acquires cannot both win.
 */
export function createSerialProvisionLeaseGate(ttlMs = PROVISION_CHAIN_LEASE_TTL_MS) {
  let lease: ProvisionChainLease | null = null;
  let tail: Promise<void> = Promise.resolve();

  return {
    acquire(token: string, now: Date): Promise<{ acquired: boolean; lease: ProvisionChainLease | null }> {
      const run = tail.then(() => {
        if (!canAcquireProvisionLease(lease, now, token)) {
          return { acquired: false as const, lease };
        }
        lease = {
          token,
          expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        };
        return { acquired: true as const, lease };
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    current(): ProvisionChainLease | null {
      return lease;
    },
  };
}

export interface StorageProvisionRecoveryEntry {
  readonly state: 'ready' | 'preparing';
  readonly leaseHeld: boolean;
}

/**
 * Daily recovery kicks only when some connection is still preparing and that
 * organization does not already hold an unexpired chain lease.
 * Ready/completed connections are left alone.
 */
export function decideStorageProvisionRecovery(input: {
  readonly entries: readonly StorageProvisionRecoveryEntry[];
}): { readonly kick: boolean; readonly reason: 'not_preparing' | 'lease_held' | 'preparing' } {
  const preparing = input.entries.filter((entry) => entry.state === 'preparing');
  if (preparing.length === 0) return { kick: false, reason: 'not_preparing' };
  if (preparing.every((entry) => entry.leaseHeld)) return { kick: false, reason: 'lease_held' };
  return { kick: true, reason: 'preparing' };
}

/**
 * A hop that provisioned nothing must not schedule another HTTP hop.
 * Remaining work stays as the batch reported it. Chain-cap deferral still
 * applies when this hop did make progress.
 */
export function shouldScheduleStorageProvisionHop(input: {
  readonly clientsProcessed: number;
  readonly projectsProcessed: number;
  readonly partiesProcessed?: number;
  readonly remaining: number;
  readonly rateLimited: boolean;
  readonly fatalError?: string;
  readonly chain: number;
  readonly rateLimitStreak: number;
}): { readonly schedule: boolean; readonly step: StorageProvisionStep } {
  if (input.fatalError) {
    return {
      schedule: false,
      step: {
        continue: false,
        delayMs: 0,
        chain: input.chain,
        rateLimitStreak: input.rateLimitStreak,
        deferred: false,
      },
    };
  }
  const partiesProcessed = input.partiesProcessed ?? 0;
  if (input.clientsProcessed === 0 && input.projectsProcessed === 0 && partiesProcessed === 0) {
    return {
      schedule: false,
      step: {
        continue: false,
        delayMs: 0,
        chain: input.chain,
        rateLimitStreak: 0,
        deferred: false,
      },
    };
  }
  const step = nextStorageProvisionStep({
    remaining: input.remaining,
    rateLimited: input.rateLimited,
    chain: input.chain,
    rateLimitStreak: input.rateLimitStreak,
  });
  return { schedule: step.continue, step };
}
