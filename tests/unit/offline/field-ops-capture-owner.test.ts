import { describe, expect, it } from 'vitest';
import {
  captureOwnerTypeForProductKind,
  compareDraftsForSync,
  ownerIdFromCapturePayload,
  pendingOwnerDraftLocalIdFromPayload,
} from '@/modules/offline/domain/sync-order';

describe('offline field-ops capture owner resolution', () => {
  it('maps product draft kinds to document owner types', () => {
    expect(captureOwnerTypeForProductKind('daily_log')).toBe('daily_log');
    expect(captureOwnerTypeForProductKind('punch')).toBe('punch_list_item');
    expect(captureOwnerTypeForProductKind('inspection')).toBe('inspection');
    expect(captureOwnerTypeForProductKind('expense')).toBeNull();
  });

  it('syncs product drafts before capture drafts', () => {
    const capture = { kind: 'capture' as const, updatedAt: '2026-08-14T08:00:00.000Z' };
    const log = { kind: 'daily_log' as const, updatedAt: '2026-08-14T09:00:00.000Z' };
    expect([capture, log].sort(compareDraftsForSync).map((row) => row.kind)).toEqual([
      'daily_log',
      'capture',
    ]);
  });

  it('prefers an existing owner id over the parent server id', () => {
    expect(
      ownerIdFromCapturePayload(
        { ownerId: 'log-existing', pendingOwnerDraftLocalId: 'local-1' },
        'log-from-parent',
      ),
    ).toBe('log-existing');
    expect(
      ownerIdFromCapturePayload({ ownerId: null, pendingOwnerDraftLocalId: 'local-1' }, 'log-from-parent'),
    ).toBe('log-from-parent');
    expect(pendingOwnerDraftLocalIdFromPayload({ pendingOwnerDraftLocalId: '  parent-1  ' })).toBe(
      'parent-1',
    );
  });
});
