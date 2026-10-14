import { describe, expect, it, vi } from 'vitest';
import { listMeetingsForOrg } from '@/modules/meetings/application/list-meetings';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError } from '@/shared/errors';

describe('listMeetingsForOrg (O05)', () => {
  it('requires meetings.read', async () => {
    const context = {
      permissions: new Set<string>(),
      db: {},
      organizationId: 'org',
      userId: 'user',
      membershipId: 'm',
    } as never;

    await expect(listMeetingsForOrg(context)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('delegates to repository when permitted', async () => {
    const listMeetings = vi
      .spyOn(await import('@/modules/meetings/data/meetings.repository'), 'listMeetings')
      .mockResolvedValue([]);

    const context = {
      permissions: new Set([PERMISSIONS.MEETINGS_READ]),
      db: { marker: 'db' },
      organizationId: 'org',
      userId: 'user',
      membershipId: 'm',
    } as never;

    await expect(listMeetingsForOrg(context, { projectId: 'proj-1' })).resolves.toEqual([]);
    expect(listMeetings).toHaveBeenCalledWith({ marker: 'db' }, 'org', { projectId: 'proj-1' });
  });
});
