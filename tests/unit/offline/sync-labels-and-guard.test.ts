import { describe, expect, it } from 'vitest';
import {
  assertOfflineDraftAllowed,
  isOfflineFinancialFinalization,
  OfflineFinancialGuardError,
} from '@/modules/offline/domain/financial-guard';
import { truthfulSyncLabel } from '@/modules/offline/domain/sync-labels';
import { DRAFT_KINDS } from '@/modules/offline/domain/types';

describe('offline truthful sync labels', () => {
  it('maps internal statuses to field-facing labels', () => {
    expect(truthfulSyncLabel('draft')).toBe('saved_on_device');
    expect(truthfulSyncLabel('queued')).toBe('waiting_to_sync');
    expect(truthfulSyncLabel('syncing')).toBe('waiting_to_sync');
    expect(truthfulSyncLabel('synced')).toBe('synced');
    expect(truthfulSyncLabel('conflict')).toBe('failed_retry');
    expect(truthfulSyncLabel('rejected')).toBe('failed_retry');
  });
});

describe('offline financial guard', () => {
  it('allows expense create drafts but blocks finalize flags', () => {
    expect(isOfflineFinancialFinalization('expense', { amount: '10' })).toBe(false);
    expect(isOfflineFinancialFinalization('expense', { finalize: true })).toBe(true);
    expect(isOfflineFinancialFinalization('expense', { status: 'finalized' })).toBe(true);
    expect(() => assertOfflineDraftAllowed('expense', { finalize: true })).toThrow(
      OfflineFinancialGuardError,
    );
  });

  it('includes note draft kind and excludes attendance clock kinds', () => {
    expect(DRAFT_KINDS).toContain('note');
    expect(DRAFT_KINDS).not.toContain('attendance');
    expect(DRAFT_KINDS).not.toContain('break');
  });
});
