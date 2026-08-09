import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  orgAuthzMemoKey,
  orgContextFromAuthzSnapshot,
  toOrgAuthzSnapshot,
  type OrgAuthzSnapshot,
} from '@/shared/auth/org-authz-memo';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function fakeContext(overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'user-a',
    organizationId: 'org-a',
    membershipId: 'mem-a',
    organization: {
      id: 'org-a',
      name: 'Acme',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set([PERMISSIONS.PROJECTS_READ]),
    roleKeys: ['member'],
    db: { __tag: 'tx-a' } as unknown as OrgContext['db'],
    locale: 'he-IL',
    ...overrides,
  };
}

describe('orgAuthzMemoKey', () => {
  it('isolates tenants and locales in the cache key', () => {
    const a = orgAuthzMemoKey('user-1', 'org-1', 'he-IL');
    const otherOrg = orgAuthzMemoKey('user-1', 'org-2', 'he-IL');
    const otherLocale = orgAuthzMemoKey('user-1', 'org-1', 'en');
    const otherUser = orgAuthzMemoKey('user-2', 'org-1', 'he-IL');

    expect(a).not.toBe(otherOrg);
    expect(a).not.toBe(otherLocale);
    expect(a).not.toBe(otherUser);
  });
});

describe('org authz snapshot round-trip', () => {
  it('strips the transaction executor from the memoized snapshot', () => {
    const context = fakeContext();
    const snapshot = toOrgAuthzSnapshot(context);

    expect(snapshot).toEqual<OrgAuthzSnapshot>({
      organizationId: 'org-a',
      membershipId: 'mem-a',
      organization: context.organization,
      permissions: context.permissions,
      roleKeys: context.roleKeys,
    });
    expect(snapshot).not.toHaveProperty('db');
    expect(snapshot).not.toHaveProperty('userId');
  });

  it('rehydrates a context with a fresh executor only', () => {
    const original = fakeContext();
    const snapshot = toOrgAuthzSnapshot(original);
    const nextDb = { __tag: 'tx-b' } as unknown as OrgContext['db'];

    const rehydrated = orgContextFromAuthzSnapshot(snapshot, {
      userId: 'user-a',
      locale: 'he-IL',
      db: nextDb,
    });

    expect(rehydrated.organizationId).toBe('org-a');
    expect(rehydrated.membershipId).toBe('mem-a');
    expect(rehydrated.permissions).toBe(original.permissions);
    expect(rehydrated.db).toBe(nextDb);
    expect(rehydrated.db).not.toBe(original.db);
  });
});
