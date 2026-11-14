import { describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';

vi.mock('@/modules/project-team/application/capability-guard', () => ({
  assertProjectCapability: vi.fn(async () => undefined),
  hasProjectCapability: vi.fn(async () => true),
}));

const { authorizeTakeoffProject } = await import('@/modules/electrical-takeoff/application/access');

const baseContext = (perms: string[]): OrgContext =>
  ({
    organizationId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    permissions: new Set(perms),
    db: {},
  }) as unknown as OrgContext;

describe('takeoff access isolation', () => {
  it('denies manage without takeoff.manage', async () => {
    const ctx = baseContext(['takeoff.view']);
    await expect(
      authorizeTakeoffProject({ kind: 'internal', context: ctx }, '00000000-0000-4000-8000-000000000010', 'manage'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('allows view with takeoff.view', async () => {
    const ctx = baseContext(['takeoff.view']);
    await expect(
      authorizeTakeoffProject({ kind: 'internal', context: ctx }, '00000000-0000-4000-8000-000000000010', 'view'),
    ).resolves.toBeUndefined();
  });
});