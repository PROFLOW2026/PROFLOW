import { describe, expect, it, vi } from 'vitest';
import {
  decideMarginSnapshotBatchLease,
  markMarginSnapshotBatchCompleted,
  MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
} from '@/modules/ops-finance/application/margin-snapshot-batch-lease';

const upsertSettingMock = vi.hoisted(() =>
  vi.fn(
    async (
      _db: unknown,
      _orgId: unknown,
      _key: unknown,
      _value: unknown,
    ): Promise<void> => undefined,
  ),
);

vi.mock('@/modules/tenancy/application/organization-setting-values', () => ({
  upsertOrganizationSettingValue: upsertSettingMock,
}));

const HOLDER_ID = '00000000-0000-4000-8000-000000000099';

function leaseStore(): { value: unknown } {
  return { value: null };
}

function createSerializedTransactionDb(store: { value: unknown }, holderId = HOLDER_ID) {
  let chain: Promise<unknown> = Promise.resolve();
  const tx = {
    execute: vi.fn(async () =>
      store.value == null ? [] : [{ value: store.value }],
    ),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(async () =>
            store.value == null ? [] : [{ value: store.value }],
          ),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: holderId }]),
          })),
        })),
      })),
    })),
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: holderId }]),
          })),
        })),
      })),
    })),
    transaction: (fn: (inner: typeof tx) => Promise<unknown>) => {
      const run = () => fn(tx);
      chain = chain.then(run);
      return chain;
    },
  };

  upsertSettingMock.mockImplementation(async (_db, _orgId, _key, value) => {
    store.value = value;
  });

  return db;
}

describe('margin snapshot batch lease', () => {
  it('skips when batch already completed for utc day', async () => {
    const store = leaseStore();
    store.value = {
      utcDay: '2026-10-09',
      status: 'completed',
      token: 'prev',
      startedAt: '2026-10-09T06:00:00.000Z',
      expiresAt: '2026-10-09T06:55:00.000Z',
      completedAt: '2026-10-09T06:10:00.000Z',
    };
    upsertSettingMock.mockClear();

    const decision = await decideMarginSnapshotBatchLease(
      createSerializedTransactionDb(store) as never,
      'new-token',
      new Date('2026-10-09T07:00:00.000Z'),
    );
    expect(decision).toEqual({ action: 'skip', reason: 'already_completed' });
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it('acquires running lease for a new utc day', async () => {
    const store = leaseStore();
    upsertSettingMock.mockClear();

    const decision = await decideMarginSnapshotBatchLease(
      createSerializedTransactionDb(store) as never,
      'token-a',
      new Date('2026-10-09T06:00:00.000Z'),
    );
    expect(decision.action).toBe('run');
    expect(upsertSettingMock).toHaveBeenCalledTimes(1);
  });

  it('marks completed for the same token', async () => {
    const store = leaseStore();
    store.value = {
      utcDay: '2026-10-09',
      status: 'running',
      token: 'token-a',
      startedAt: '2026-10-09T06:00:00.000Z',
      expiresAt: '2026-10-09T06:55:00.000Z',
    };
    upsertSettingMock.mockClear();

    await markMarginSnapshotBatchCompleted(
      createSerializedTransactionDb(store) as never,
      HOLDER_ID,
      'token-a',
      new Date('2026-10-09T06:12:00.000Z'),
    );

    expect(upsertSettingMock).toHaveBeenCalledWith(
      expect.anything(),
      HOLDER_ID,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
      expect.objectContaining({ status: 'completed', token: 'token-a' }),
    );
  });

  it('allows only one concurrent acquire for the same utc day', async () => {
    const store = leaseStore();
    upsertSettingMock.mockClear();
    const db = createSerializedTransactionDb(store);
    const now = new Date('2026-10-09T06:00:00.000Z');

    const [first, second] = await Promise.all([
      decideMarginSnapshotBatchLease(db as never, 'token-a', now),
      decideMarginSnapshotBatchLease(db as never, 'token-b', now),
    ]);

    expect(first.action).toBe('run');
    expect(second.action).toBe('skip');
    if (second.action === 'skip') {
      expect(second.reason).toBe('lease_held');
    }
    expect(upsertSettingMock).toHaveBeenCalledTimes(1);
  });
});
