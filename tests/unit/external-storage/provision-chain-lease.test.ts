import { describe, expect, it } from 'vitest';
import {
  canAcquireProvisionLease,
  createSerialProvisionLeaseGate,
  decideStorageProvisionRecovery,
  shouldScheduleStorageProvisionHop,
} from '@/modules/external-storage/domain/provision-chain-lease';

describe('storage provision chain', () => {
  it('does not schedule another hop when a batch made zero progress', () => {
    const decision = shouldScheduleStorageProvisionHop({
      clientsProcessed: 0,
      projectsProcessed: 0,
      remaining: 12,
      rateLimited: false,
      chain: 4,
      rateLimitStreak: 0,
    });
    expect(decision.schedule).toBe(false);
    expect(decision.step.deferred).toBe(false);
    expect(decision.step.chain).toBe(4);
  });

  it('still schedules when this hop made progress and work remains', () => {
    const decision = shouldScheduleStorageProvisionHop({
      clientsProcessed: 2,
      projectsProcessed: 0,
      remaining: 3,
      rateLimited: false,
      chain: 1,
      rateLimitStreak: 0,
    });
    expect(decision.schedule).toBe(true);
    expect(decision.step.chain).toBe(2);
  });

  it('leaves a completed organization completed', () => {
    const decision = shouldScheduleStorageProvisionHop({
      clientsProcessed: 0,
      projectsProcessed: 0,
      remaining: 0,
      rateLimited: false,
      chain: 2,
      rateLimitStreak: 0,
    });
    expect(decision.schedule).toBe(false);
    expect(decision.step.deferred).toBe(false);
  });

  it('blocks a second token while the lease is unexpired', () => {
    const now = new Date('2026-09-25T12:00:00.000Z');
    const existing = { token: 'chain-a', expiresAt: '2026-09-25T12:08:00.000Z' };
    expect(canAcquireProvisionLease(existing, now, 'chain-a')).toBe(true);
    expect(canAcquireProvisionLease(existing, now, 'chain-b')).toBe(false);
  });

  it('reclaims an expired lease', () => {
    const now = new Date('2026-09-25T12:09:00.000Z');
    const existing = { token: 'chain-a', expiresAt: '2026-09-25T12:08:00.000Z' };
    expect(canAcquireProvisionLease(existing, now, 'chain-b')).toBe(true);
  });

  it('lets only one of two concurrent kicks obtain the org lease', async () => {
    const gate = createSerialProvisionLeaseGate(1_000);
    const now = new Date('2026-09-25T12:00:00.000Z');
    const [first, second] = await Promise.all([
      gate.acquire('chain-a', now),
      gate.acquire('chain-b', now),
    ]);
    const winners = [first, second].filter((result) => result.acquired);
    expect(winners).toHaveLength(1);
    expect(gate.current()?.token).toBe(winners[0]?.lease?.token);
  });

  it('resumes preparing storage when no lease is held', () => {
    expect(
      decideStorageProvisionRecovery({
        entries: [{ state: 'preparing', leaseHeld: false }],
      }),
    ).toEqual({ kick: true, reason: 'preparing' });
  });

  it('does not kick when an active lease already covers preparing work', () => {
    expect(
      decideStorageProvisionRecovery({
        entries: [{ state: 'preparing', leaseHeld: true }],
      }),
    ).toEqual({ kick: false, reason: 'lease_held' });
  });

  it('does not kick when every connection is already ready', () => {
    expect(
      decideStorageProvisionRecovery({
        entries: [
          { state: 'ready', leaseHeld: false },
          { state: 'ready', leaseHeld: false },
        ],
      }),
    ).toEqual({ kick: false, reason: 'not_preparing' });
  });
});
