import { describe, expect, it, vi } from 'vitest';
import * as projectTeam from '@/modules/project-team';
import * as workforceTeam from '@/modules/workforce/application/project-team';
import { listAssigneeOptions } from '@/modules/rfi/application/support';
import { PERMISSIONS } from '@/shared/permissions/catalog';

describe('listAssigneeOptions (K07)', () => {
  it('includes roster-only employees as disabled options', async () => {
    vi.spyOn(projectTeam, 'listProjectTeam').mockResolvedValue([
      {
        userId: 'u-team',
        status: 'active',
        displayName: 'Team Member',
        email: 'team@test',
      },
    ] as never);
    vi.spyOn(workforceTeam, 'listProjectTeamMembers').mockResolvedValue([
      {
        userId: 'u-roster',
        employeeName: 'Roster Only',
        employeeId: 'e1',
        membershipId: 'm1',
        jobTitle: null,
        role: null,
        notes: null,
        startDate: '2026-01-01',
        endDate: null,
        status: 'active',
        totalHours: '0',
        entryCount: 0,
      },
    ]);

    const context = {
      permissions: new Set([PERMISSIONS.WORKFORCE_READ, PERMISSIONS.PROJECTS_READ]),
      db: {},
      organizationId: 'org',
      userId: 'u-team',
    } as never;

    const options = await listAssigneeOptions(context, 'project-1');
    expect(options.find((row) => row.userId === 'u-roster')?.selectable).toBe(false);
    expect(options.find((row) => row.userId === 'u-team')?.selectable).toBe(true);
  });
});
