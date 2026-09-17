import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const redirectMock = vi.fn((value: unknown) => {
  throw value;
});

vi.mock('@/shared/i18n/navigation', () => ({
  redirect: (value: unknown) => redirectMock(value),
}));

function employeeContext(overrides: Partial<OrgContext['employeeApp']> = {}): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    db: {} as OrgContext['db'],
    organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions: new Set([PERMISSIONS.ATTENDANCE_SELF]),
    roleKeys: ['employee'],
    employeeApp: {
      employeeId: 'emp-1',
      grants: new Map(),
      allowedDocumentCategories: null,
      account: {
        id: 'acc-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        userId: 'user-1',
        status: 'active',
        username: '2485',
        usernameNormalized: '2485',
        authEmail: '2485@employee.local',
        pinMustChange: false,
        temporaryPinExpiresAt: null,
        firstLoginAt: null,
        lastLoginAt: null,
        accessStartsAt: null,
        accessEndsAt: null,
        disabledAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      ...overrides,
    },
  };
}

describe('assertOwnerAppSurface', () => {
  afterEach(() => {
    redirectMock.mockClear();
  });

  it('redirects active employee app users to employee home', async () => {
    const { assertOwnerAppSurface } = await import(
      '@/modules/employee-app/application/session-guard'
    );

    expect(() => assertOwnerAppSurface(employeeContext())).toThrow();
    expect(redirectMock).toHaveBeenCalledWith({ href: '/employee', locale: 'he-IL' });
  });

  it('allows owner sessions without employee app context', async () => {
    const { assertOwnerAppSurface } = await import(
      '@/modules/employee-app/application/session-guard'
    );

    const owner: OrgContext = {
      ...employeeContext(),
      roleKeys: ['owner'],
      employeeApp: undefined,
      permissions: new Set([PERMISSIONS.ORG_READ, PERMISSIONS.WORKFORCE_MANAGE]),
    };

    expect(() => assertOwnerAppSurface(owner)).not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
