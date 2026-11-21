import { describe, expect, it, vi } from 'vitest';
import { withTakeoffWorkerCallbackTx } from '@/modules/electrical-takeoff/application/worker-callbacks';
import type { DbExecutor } from '@/shared/db/types';

describe('withTakeoffWorkerCallbackTx', () => {
  it('opens a transaction and sets local service_role before running', async () => {
    const sqlCalls: string[] = [];
    const tx = {
      execute: vi.fn(async (query: { queryChunks?: unknown[] } | string) => {
        sqlCalls.push(typeof query === 'string' ? query : JSON.stringify(query));
        return [];
      }),
    };
    const db = {
      transaction: vi.fn(async (fn: (inner: typeof tx) => Promise<string>) => fn(tx)),
    } as unknown as DbExecutor;

    const result = await withTakeoffWorkerCallbackTx(db, async (inner) => {
      expect(inner).toBe(tx);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.execute).toHaveBeenCalled();
    const sent = JSON.stringify(tx.execute.mock.calls[0]?.[0] ?? '');
    expect(sent).toMatch(/service_role/);
  });
});
