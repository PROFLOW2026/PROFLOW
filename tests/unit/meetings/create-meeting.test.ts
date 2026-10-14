import { describe, expect, it, vi } from 'vitest';
import { createMeeting } from '@/modules/meetings/application/create-meeting';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError } from '@/shared/errors';

describe('createMeeting (O05)', () => {
  it('requires meetings.manage', async () => {
    const context = {
      permissions: new Set<string>(),
      db: {},
      organizationId: 'org',
      userId: 'user',
      membershipId: 'm',
    } as never;

    await expect(
      createMeeting(context, {
        title: 'Sync',
        scheduledAt: new Date('2026-03-01T10:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('inserts when permitted', async () => {
    vi.spyOn(await import('@/modules/meetings/data/meetings.repository'), 'insertMeeting').mockResolvedValue({
      id: 'meet-1',
    } as never);
    const context = {
      permissions: new Set([PERMISSIONS.MEETINGS_MANAGE]),
      db: {},
      organizationId: 'org',
      userId: 'user',
      membershipId: 'm',
    } as never;

    await expect(
      createMeeting(context, {
        title: 'Sync',
        scheduledAt: new Date('2026-03-01T10:00:00Z'),
      }),
    ).resolves.toMatchObject({ id: 'meet-1' });
  });
});
