import { describe, expect, it } from 'vitest';
import { matchSearchCommands } from '@/modules/search/domain/commands';
import { groupSearchHits } from '@/modules/search/domain/group';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import type { GlobalSearchHit } from '@/modules/search/domain/types';

function contextWith(keys: readonly string[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    organization: {
      id: 'org-1',
      name: 'Acme',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(keys) as OrgContext['permissions'],
    roleKeys: ['owner'],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

const modules = {
  quotes: true,
  command_center: true,
  vendors: true,
  clients: true,
  documents: true,
} as ModuleVisibility;

describe('search commands', () => {
  it('matches create expense when the user can create expenses', () => {
    const hits = matchSearchCommands(
      'create expense',
      contextWith([PERMISSIONS.EXPENSES_CREATE]),
      modules,
    );
    expect(hits.some((hit) => hit.id === 'create-expense')).toBe(true);
  });

  it('shows open-today even when the old command_center module preference is off', () => {
    const hits = matchSearchCommands(
      'היום',
      contextWith([PERMISSIONS.COMMAND_CENTER_READ]),
      { ...modules, command_center: false },
    );
    expect(hits.some((hit) => hit.id === 'open-today')).toBe(true);
  });

  it('hides open-today without permission', () => {
    const hits = matchSearchCommands('היום', contextWith([]), modules);
    expect(hits.some((hit) => hit.id === 'open-today')).toBe(false);
  });
});

describe('groupSearchHits', () => {
  it('groups by kind in stable catalog order', () => {
    const hits: GlobalSearchHit[] = [
      { kind: 'vendor', id: 'v1', title: 'Vendor', subtitle: null, href: '/vendors/v1' },
      { kind: 'client', id: 'c1', title: 'Client', subtitle: null, href: '/clients/c1' },
      { kind: 'warranty', id: 'w1', title: 'Roof', subtitle: null, href: '/projects/p1?tab=warranty' },
    ];
    expect(groupSearchHits(hits).map((group) => group.kind)).toEqual([
      'client',
      'vendor',
      'warranty',
    ]);
  });
});
