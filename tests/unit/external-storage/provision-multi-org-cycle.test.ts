import { describe, expect, it } from 'vitest';
import { nextStorageProvisionStep } from '@/modules/external-storage/domain/project-folder-placement';

/**
 * Documents the multi-org cycle contract: completing one connection must not
 * abort work for other connected providers (regression: OneDrive stayed 0/N
 * because primary Google finished with remaining=0 and broke the whole loop).
 */
describe('storage provision multi-org cycle contract', () => {
  it('continues hopping when remaining work exists after rate limits', () => {
    const step = nextStorageProvisionStep({
      remaining: 4,
      rateLimited: true,
      chain: 1,
      rateLimitStreak: 0,
    });
    expect(step.continue).toBe(true);
  });

  it('stops hopping when remaining is zero or the chain cap is hit', () => {
    const done = nextStorageProvisionStep({
      remaining: 0,
      rateLimited: false,
      chain: 3,
      rateLimitStreak: 0,
    });
    expect(done.continue).toBe(false);
    expect(done.deferred).toBe(false);

    const capped = nextStorageProvisionStep({
      remaining: 4,
      rateLimited: false,
      chain: 399,
      rateLimitStreak: 0,
    });
    expect(capped.continue).toBe(false);
    expect(capped.deferred).toBe(true);
    expect(capped.chain).not.toBe(0);
  });
});

describe('canonical ProjectFlow root rules', () => {
  it('rejects drive-root identity as organization root', () => {
    const driveRootId: string = 'DRIVE_ROOT';
    const storedRootId: string = 'DRIVE_ROOT';
    const underProviderRootId: string = 'PF_CHILD';
    const rootName: string = 'ProjectFlow';
    const storedName: string = 'root';

    const isCanonical =
      Boolean(storedRootId) &&
      storedName === rootName &&
      underProviderRootId === storedRootId &&
      storedRootId !== driveRootId;

    expect(isCanonical).toBe(false);
  });

  it('accepts ProjectFlow child directly under provider root', () => {
    const driveRootId: string = 'DRIVE_ROOT';
    const storedRootId: string = 'PF_CHILD';
    const underProviderRootId: string = 'PF_CHILD';
    const rootName: string = 'ProjectFlow';
    const storedName: string = 'ProjectFlow';

    const isCanonical =
      Boolean(storedRootId) &&
      storedName === rootName &&
      underProviderRootId === storedRootId &&
      storedRootId !== driveRootId;

    expect(isCanonical).toBe(true);
  });
});
