import { describe, expect, it } from 'vitest';
import {
  canAccessSection,
  SETTINGS_SECTIONS,
} from '@/app/[locale]/(app)/settings/_lib/access';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function employeeContext(): OrgContext {
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
    },
  };
}

describe('settings access for employee app users', () => {
  it('denies every settings section including profile and app', () => {
    const context = employeeContext();
    for (const section of SETTINGS_SECTIONS) {
      expect(canAccessSection(context, section)).toBe(false);
    }
  });
});
