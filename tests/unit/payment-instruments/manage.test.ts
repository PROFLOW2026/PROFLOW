import { describe, expect, it, vi } from 'vitest';
import {
  deactivatePaymentInstrument,
  upsertPaymentInstrument,
} from '@/modules/payment-instruments/application/manage';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError, ValidationError } from '@/shared/errors';

function makeMockDb(insertId = 'inst-new') {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const returning = vi.fn().mockResolvedValue([{ id: insertId }]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert, update, set, where, values, returning };
}

function contextWith(permissions: readonly string[], db = makeMockDb()) {
  return {
    permissions: new Set(permissions),
    db,
    organizationId: 'org',
    userId: 'user',
    membershipId: 'm',
  } as never;
}

describe('payment instrument manage (O05)', () => {
  it('upsert requires settings.manage', async () => {
    await expect(
      upsertPaymentInstrument(contextWith([]), { displayName: 'Card' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects invalid lastFour when permitted', async () => {
    await expect(
      upsertPaymentInstrument(contextWith([PERMISSIONS.SETTINGS_MANAGE]), {
        lastFour: '12ab',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects debit day out of range when permitted', async () => {
    await expect(
      upsertPaymentInstrument(contextWith([PERMISSIONS.SETTINGS_MANAGE]), {
        monthlyDebitDay: 29,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts new instrument when permitted', async () => {
    const db = makeMockDb('pi-1');
    const id = await upsertPaymentInstrument(
      contextWith([PERMISSIONS.SETTINGS_MANAGE], db),
      { displayName: 'Corp card', lastFour: '4242', monthlyDebitDay: 15 },
    );
    expect(id).toBe('pi-1');
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org',
        instrumentType: 'credit_card',
        displayName: 'Corp card',
        lastFour: '4242',
        monthlyDebitDay: 15,
        isActive: true,
      }),
    );
  });

  it('updates existing instrument when id provided', async () => {
    const db = makeMockDb();
    const id = await upsertPaymentInstrument(
      contextWith([PERMISSIONS.SETTINGS_MANAGE], db),
      { id: 'pi-existing', lastFour: '9999' },
    );
    expect(id).toBe('pi-existing');
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({
        lastFour: '9999',
        isActive: true,
      }),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('deactivate requires settings.manage', async () => {
    await expect(
      deactivatePaymentInstrument(contextWith([]), 'pi-1'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('deactivates when permitted', async () => {
    const db = makeMockDb();
    await deactivatePaymentInstrument(contextWith([PERMISSIONS.SETTINGS_MANAGE], db), 'pi-1');
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });
});
