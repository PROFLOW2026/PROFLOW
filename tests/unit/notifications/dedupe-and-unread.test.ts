import { describe, expect, it } from 'vitest';
import { buildDedupeKey } from '@/modules/notifications/domain/dedupe';
import { applyEmitUpsert } from '@/modules/notifications/domain/upsert';
import { isActiveNotification, isUnreadNotification } from '@/modules/notifications/domain/unread';

const ORG = '018f1234-5678-7abc-8def-0123456789aa';
const USER = '018f1234-5678-7abc-8def-0123456789ab';
const ENTITY = '018f1234-5678-7abc-8def-0123456789ac';

describe('notification dedupe keys', () => {
  it('is stable for the same type and entity', () => {
    expect(buildDedupeKey('billing_overdue', ENTITY)).toBe(buildDedupeKey('billing_overdue', ENTITY));
    expect(buildDedupeKey('billing_overdue', ENTITY)).toBe(`billing_overdue:${ENTITY}`);
  });

  it('changes when type, entity, or qualifier changes', () => {
    expect(buildDedupeKey('billing_overdue', ENTITY)).not.toBe(buildDedupeKey('ap_overdue', ENTITY));
    expect(buildDedupeKey('work_order_assigned', ENTITY, USER)).not.toBe(
      buildDedupeKey('work_order_assigned', ENTITY),
    );
  });
});

describe('emit upsert', () => {
  it('does not duplicate on the same org/recipient/dedupe key', () => {
    const patch = {
      organizationId: ORG,
      recipientUserId: USER,
      type: 'billing_overdue',
      domain: 'billing',
      title: 'Overdue',
      body: 'Pay this',
      severity: 'urgent',
      deepLink: `/billing/${ENTITY}`,
      dedupeKey: buildDedupeKey('billing_overdue', ENTITY),
      entityType: 'billing_record',
      entityId: ENTITY,
      metadata: null,
      expiresAt: null,
    };

    const afterFirst = applyEmitUpsert([], patch, 'id-1');
    const afterSecond = applyEmitUpsert(afterFirst, { ...patch, title: 'Still overdue', body: 'Updated' }, 'id-2');

    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.id).toBe('id-1');
    expect(afterSecond[0]?.title).toBe('Still overdue');
    expect(afterSecond[0]?.body).toBe('Updated');
    expect(afterSecond[0]?.resolvedAt).toBeNull();
    expect(afterSecond[0]?.dismissedAt).toBeNull();
  });

  it('reopens a previously resolved row on emit', () => {
    const patch = {
      organizationId: ORG,
      recipientUserId: USER,
      type: 'billing_overdue',
      domain: 'billing',
      title: 'Overdue',
      body: 'Pay this',
      severity: 'urgent',
      deepLink: `/billing/${ENTITY}`,
      dedupeKey: buildDedupeKey('billing_overdue', ENTITY),
      entityType: 'billing_record',
      entityId: ENTITY,
      metadata: null,
      expiresAt: null,
    };
    const resolved = applyEmitUpsert([], patch, 'id-1').map((row) => ({
      ...row,
      resolvedAt: new Date('2026-08-01T00:00:00.000Z'),
    }));
    const reopened = applyEmitUpsert(resolved, patch, 'id-2');
    expect(reopened).toHaveLength(1);
    expect(reopened[0]?.resolvedAt).toBeNull();
  });
});

describe('resolved vs unread', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const base = {
    readAt: null as Date | null,
    dismissedAt: null as Date | null,
    resolvedAt: null as Date | null,
    expiresAt: null as Date | null,
  };

  it('counts a fresh row as unread', () => {
    expect(isUnreadNotification(base, now)).toBe(true);
    expect(isActiveNotification(base, now)).toBe(true);
  });

  it('excludes resolved, dismissed, expired, and read from unread', () => {
    expect(isUnreadNotification({ ...base, resolvedAt: now }, now)).toBe(false);
    expect(isUnreadNotification({ ...base, dismissedAt: now }, now)).toBe(false);
    expect(isUnreadNotification({ ...base, readAt: now }, now)).toBe(false);
    expect(isUnreadNotification({ ...base, expiresAt: new Date('2026-08-14T12:00:00.000Z') }, now)).toBe(
      false,
    );
  });

  it('keeps a read-but-unresolved item active in the list', () => {
    expect(isActiveNotification({ ...base, readAt: now }, now)).toBe(true);
    expect(isActiveNotification({ ...base, resolvedAt: now }, now)).toBe(false);
  });
});
