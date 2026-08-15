import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import {
  assertPermission,
  assertSameOrganization,
  hasAllPermissions,
  hasAnyPermission,
} from '@/shared/permissions/assert';
import { PERMISSIONS, PERMISSION_CATALOG, type PermissionKey } from '@/shared/permissions/catalog';
import {
  ROLE_TEMPLATES,
  TOGGLEABLE_PERMISSIONS,
  roleTemplate,
} from '@/shared/permissions/role-templates';

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

describe('permission assertions', () => {
  it('allows a granted permission and refuses everything else', () => {
    const context = contextWith([PERMISSIONS.PROJECTS_READ]);
    expect(() => assertPermission(context, PERMISSIONS.PROJECTS_READ)).not.toThrow();
    expect(() => assertPermission(context, PERMISSIONS.PROJECTS_CREATE)).toThrow(AuthorizationError);
  });

  it('distinguishes any from all', () => {
    const context = contextWith([PERMISSIONS.EXPENSES_READ]);
    expect(hasAnyPermission(context, [PERMISSIONS.EXPENSES_READ, PERMISSIONS.BILLING_READ])).toBe(true);
    expect(hasAllPermissions(context, [PERMISSIONS.EXPENSES_READ, PERMISSIONS.BILLING_READ])).toBe(false);
  });
});

describe('cross-tenant guard', () => {
  const context = contextWith([]);

  it('refuses a record belonging to another organization', () => {
    expect(() => assertSameOrganization(context, { organizationId: 'org-2' }, 'Project')).toThrow(
      AuthorizationError,
    );
  });

  it('refuses a missing record rather than treating it as permitted', () => {
    expect(() => assertSameOrganization(context, null, 'Project')).toThrow(AuthorizationError);
    expect(() => assertSameOrganization(context, undefined, 'Project')).toThrow(AuthorizationError);
  });

  it('accepts a record inside the active organization', () => {
    expect(() => assertSameOrganization(context, { organizationId: 'org-1' }, 'Project')).not.toThrow();
  });
});

describe('permission catalog integrity', () => {
  const catalogKeys = new Set(PERMISSION_CATALOG.map((entry) => entry.key));

  it('has no duplicate keys', () => {
    expect(catalogKeys.size).toBe(PERMISSION_CATALOG.length);
  });

  it('exposes every catalog key through the PERMISSIONS constant', () => {
    const constants = new Set<string>(Object.values(PERMISSIONS));
    for (const key of catalogKeys) expect(constants.has(key)).toBe(true);
    expect(constants.size).toBe(catalogKeys.size);
  });

  it('grants owners the full catalog, so a tenant is never unadministrable', () => {
    const owner = roleTemplate('owner');
    for (const key of catalogKeys) {
      expect(owner.permissions).toContain(key);
    }
    expect(owner.isProtected).toBe(true);
  });

  it('only references real permissions in every role template', () => {
    for (const template of ROLE_TEMPLATES) {
      for (const permission of template.permissions) {
        expect(catalogKeys.has(permission)).toBe(true);
      }
    }
  });

  it('hides profit from managers and workers by default', () => {
    expect(roleTemplate('manager').permissions).not.toContain(PERMISSIONS.PROJECT_PROFIT_READ);
    expect(roleTemplate('worker').permissions).not.toContain(PERMISSIONS.PROJECT_PROFIT_READ);
  });

  it('hides employer cost from workers; grants cost read to manager and finance', () => {
    expect(roleTemplate('worker').permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_READ);
    expect(roleTemplate('worker').permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_MANAGE);
    expect(roleTemplate('manager').permissions).toContain(PERMISSIONS.WORKFORCE_COST_READ);
    expect(roleTemplate('manager').permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_MANAGE);
    expect(roleTemplate('finance').permissions).toContain(PERMISSIONS.WORKFORCE_COST_READ);
    expect(roleTemplate('finance').permissions).toContain(PERMISSIONS.WORKFORCE_COST_MANAGE);
  });

  it('keeps every toggleable permission inside the catalog', () => {
    for (const permissions of Object.values(TOGGLEABLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(catalogKeys.has(permission)).toBe(true);
      }
    }
  });

  it('offers the owner role nothing to toggle, since it already has everything', () => {
    expect(TOGGLEABLE_PERMISSIONS.owner).toHaveLength(0);
  });

  it('lets owners turn projects.access_all on or off for manager and finance', () => {
    expect(TOGGLEABLE_PERMISSIONS.manager).toContain(PERMISSIONS.PROJECTS_ACCESS_ALL);
    expect(TOGGLEABLE_PERMISSIONS.finance).toContain(PERMISSIONS.PROJECTS_ACCESS_ALL);
    expect(TOGGLEABLE_PERMISSIONS.worker).not.toContain(PERMISSIONS.PROJECTS_ACCESS_ALL);
  });

  it('lets owners turn workforce.manage on or off for manager', () => {
    expect(TOGGLEABLE_PERMISSIONS.manager).toContain(PERMISSIONS.WORKFORCE_MANAGE);
    expect(TOGGLEABLE_PERMISSIONS.finance).not.toContain(PERMISSIONS.WORKFORCE_MANAGE);
  });
});
