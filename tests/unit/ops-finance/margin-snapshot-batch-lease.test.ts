import { describe, expect, it, vi } from 'vitest';
import {
  decideMarginSnapshotBatchLease,
  markMarginSnapshotBatchCompleted,
  MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
} from '@/modules/ops-finance/application/margin-snapshot-batch-lease';

const getSettingMock = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const upsertSettingMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/modules/tenancy/data/organization-settings.repository', () => ({
  getOrganizationSettingValue: getSettingMock,
  upsertOrganizationSettingValue: upsertSettingMock,
}));

function leaseHolderDb(holderId = '00000000-0000-4000-8000-000000000099') {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: holderId }]),
          })),
        })),
      })),
    })),
  };
}

describe('margin snapshot batch lease', () => {
  it('skips when batch already completed for utc day', async () => {
    getSettingMock.mockResolvedValue({
      utcDay: '2026-10-09',
      status: 'completed',
      token: 'prev',
      startedAt: '2026-10-09T06:00:00.000Z',
      expiresAt: '2026-10-09T06:55:00.000Z',
      completedAt: '2026-10-09T06:10:00.000Z',
    });

    const decision = await decideMarginSnapshotBatchLease(
      leaseHolderDb() as never,
      'new-token',
      new Date('2026-10-09T07:00:00.000Z'),
    );
    expect(decision).toEqual({ action: 'skip', reason: 'already_completed' });
    expect(upsertSettingMock).not.toHaveBeenCalled();
  });

  it('acquires running lease for a new utc day', async () => {
    getSettingMock.mockResolvedValue(null);
    upsertSettingMock.mockClear();

    const decision = await decideMarginSnapshotBatchLease(
      leaseHolderDb() as never,
      'token-a',
      new Date('2026-10-09T06:00:00.000Z'),
    );
    expect(decision.action).toBe('run');
    expect(upsertSettingMock).toHaveBeenCalledTimes(1);
  });

  it('marks completed for the same token', async () => {
    const holderId = '00000000-0000-4000-8000-000000000099';
    getSettingMock.mockResolvedValue({
      utcDay: '2026-10-09',
      status: 'running',
      token: 'token-a',
      startedAt: '2026-10-09T06:00:00.000Z',
      expiresAt: '2026-10-09T06:55:00.000Z',
    });
    upsertSettingMock.mockClear();

    await markMarginSnapshotBatchCompleted(
      leaseHolderDb() as never,
      holderId,
      'token-a',
      new Date('2026-10-09T06:12:00.000Z'),
    );

    expect(upsertSettingMock).toHaveBeenCalledWith(
      expect.anything(),
      holderId,
      MARGIN_SNAPSHOT_BATCH_LEASE_SETTING_KEY,
      expect.objectContaining({ status: 'completed', token: 'token-a' }),
    );
  });
});
