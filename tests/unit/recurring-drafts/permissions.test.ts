import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import {
  ANY_DRAFT_ACCESS_PERMISSIONS,
  ANY_DRAFT_READ_PERMISSIONS,
  assertCanManageDraftKind,
  assertCanReadDraftKind,
  canManageDraftKind,
  canReadDraftKind,
  DRAFT_KIND_READ_PERMISSION,
  DRAFT_KIND_WRITE_PERMISSION,
  readableDraftKinds,
  writableDraftKinds,
} from '@/modules/recurring-drafts/domain/permissions';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('recurring draft permissions', () => {
  it('maps kind-specific read and write keys (RLS-aligned)', () => {
    expect(DRAFT_KIND_READ_PERMISSION).toEqual({
      expense: PERMISSIONS.EXPENSES_READ,
      vendor_bill: PERMISSIONS.AP_READ,
      billing_record: PERMISSIONS.BILLING_READ,
    });
    expect(DRAFT_KIND_WRITE_PERMISSION).toEqual({
      expense: PERMISSIONS.EXPENSES_CREATE,
      vendor_bill: PERMISSIONS.AP_MANAGE,
      billing_record: PERMISSIONS.BILLING_MANAGE,
    });
  });

  it('filters readable and writable kinds by permission', () => {
    const ctx = contextWith([PERMISSIONS.EXPENSES_READ, PERMISSIONS.AP_MANAGE]);
    expect(readableDraftKinds(ctx)).toEqual(['expense', 'vendor_bill']);
    expect(writableDraftKinds(ctx)).toEqual(['vendor_bill']);
    expect(canReadDraftKind(ctx, 'expense')).toBe(true);
    expect(canReadDraftKind(ctx, 'vendor_bill')).toBe(true);
    expect(canManageDraftKind(ctx, 'vendor_bill')).toBe(true);
    expect(canManageDraftKind(ctx, 'expense')).toBe(false);

    const expenseWriter = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    expect(canManageDraftKind(expenseWriter, 'expense')).toBe(true);
    expect(canReadDraftKind(expenseWriter, 'expense')).toBe(true);
    expect(readableDraftKinds(expenseWriter)).toEqual(['expense']);
  });

  it('asserts kind-specific gates', () => {
    const reader = contextWith([PERMISSIONS.BILLING_READ]);
    expect(() => assertCanReadDraftKind(reader, 'billing_record')).not.toThrow();
    expect(() => assertCanManageDraftKind(reader, 'billing_record')).toThrow(AuthorizationError);
    expect(() => assertCanReadDraftKind(reader, 'expense')).toThrow(AuthorizationError);

    const writer = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    expect(() => assertCanReadDraftKind(writer, 'expense')).not.toThrow();
    expect(() => assertCanManageDraftKind(writer, 'expense')).not.toThrow();
  });

  it('lists any-read keys used by navigation', () => {
    expect(ANY_DRAFT_READ_PERMISSIONS).toEqual([
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.AP_READ,
      PERMISSIONS.BILLING_READ,
    ]);
    expect(ANY_DRAFT_ACCESS_PERMISSIONS).toEqual([
      PERMISSIONS.EXPENSES_READ,
      PERMISSIONS.AP_READ,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.AP_MANAGE,
      PERMISSIONS.BILLING_MANAGE,
    ]);
  });
});
