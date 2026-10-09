import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { ALL_PERMISSION_KEYS, PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import {
  assertCanDecideTaskApproval,
  assertCanSubmitTaskApproval,
  assertNotSelfTaskApproval,
} from '@/modules/tasks/application/task-approval-auth';

function contextWith(permissions: readonly PermissionKey[], userId = 'user-1'): OrgContext {
  return {
    userId,
    organizationId: 'org-1',
    membershipId: 'mem-1',
    locale: 'en',
    db: {} as OrgContext['db'],
    organization: {
      id: 'org-1',
      name: 'Org',
      timezone: 'Asia/Jerusalem',
    } as OrgContext['organization'],
    permissions: new Set<PermissionKey>(permissions),
    roleKeys: ['worker'],
  };
}

describe('task approval auth', () => {
  it('allows submit with tasks.update', () => {
    expect(() =>
      assertCanSubmitTaskApproval(contextWith([PERMISSIONS.TASKS_UPDATE])),
    ).not.toThrow();
  });

  it('allows decide with tasks.approve only', () => {
    expect(() =>
      assertCanDecideTaskApproval(contextWith([PERMISSIONS.TASKS_APPROVE])),
    ).not.toThrow();
  });

  it('blocks self-approval for non-owner submitter', () => {
    expect(() =>
      assertNotSelfTaskApproval(contextWith([PERMISSIONS.TASKS_APPROVE], 'user-a'), 'user-a'),
    ).toThrow(DomainRuleError);
  });

  it('allows self-approval for unrestricted owner', () => {
    expect(() =>
      assertNotSelfTaskApproval(
        contextWith(ALL_PERMISSION_KEYS, 'user-a'),
        'user-a',
      ),
    ).not.toThrow();
  });
});
