import { describe, expect, it, vi } from 'vitest';
import { inspectWorkerCallbackAuth } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { sealJobToken } from '@/modules/electrical-takeoff/application/worker-token';
import type { DbExecutor } from '@/shared/db/types';

const secret = 'unit-test-takeoff-worker-secret!!!!';

describe('inspectWorkerCallbackAuth deny reasons', () => {
  it('classifies missing or forged bearer as bad_token', async () => {
    const db = { execute: vi.fn() } as unknown as DbExecutor;
    const missing = await inspectWorkerCallbackAuth(db, 'job-a', '', secret, Date.now());
    expect(missing).toEqual({ job: null, reason: 'bad_token' });
    const forged = await inspectWorkerCallbackAuth(db, 'job-a', 'not-a-token', secret, Date.now());
    expect(forged).toEqual({ job: null, reason: 'bad_token' });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('classifies bearer for another job as job_mismatch', async () => {
    const db = { execute: vi.fn() } as unknown as DbExecutor;
    const sealed = sealJobToken('job-a', secret, 60_000, Date.now());
    const result = await inspectWorkerCallbackAuth(db, 'job-b', sealed.bearer, secret, Date.now());
    expect(result).toEqual({ job: null, reason: 'job_mismatch' });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
