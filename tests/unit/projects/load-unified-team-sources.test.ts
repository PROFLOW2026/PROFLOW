import { describe, expect, it, vi } from 'vitest';
import * as projectTeamRepo from '@/modules/project-team/data/project-team.repository';
import * as projectAccess from '@/modules/projects/application/project-access';
import * as workforceTeam from '@/modules/workforce/application/project-team';
import * as tenancy from '@/modules/tenancy';
import { loadUnifiedProjectTeamSources } from '@/modules/projects/application/unified-project-team';
import { PERMISSIONS } from '@/shared/permissions/catalog';

describe('loadUnifiedProjectTeamSources (U05)', () => {
  it('returns roster empty and capabilities populated when only projects.read is held', async () => {
    vi.spyOn(projectTeamRepo, 'listProjectMembers').mockResolvedValue([
      {
        id: 'm1',
        organizationId: 'org',
        projectId: 'p1',
        userId: 'u1',
        title: null,
        templateKey: null,
        status: 'active',
        endedAt: null,
        capabilities: ['project.view'],
        displayName: 'Member',
        email: 'm@test',
      },
    ]);
    vi.spyOn(workforceTeam, 'listProjectTeamMembers').mockResolvedValue([
      {
        membershipId: 'a1',
        employeeId: 'e1',
        userId: 'u2',
        employeeName: 'Roster',
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
    vi.spyOn(projectAccess, 'listProjectAccessGrantsForOrg').mockResolvedValue([]);
    vi.spyOn(tenancy, 'listOrganizationMembers').mockResolvedValue([]);

    const context = {
      permissions: new Set([PERMISSIONS.PROJECTS_READ]),
      db: {},
      organizationId: 'org',
      userId: 'viewer',
    } as never;

    const sources = await loadUnifiedProjectTeamSources(context, 'p1');
    expect(sources.roster).toEqual([]);
    expect(sources.capabilities).toHaveLength(1);
    expect(sources.capabilities[0]?.userId).toBe('u1');
  });
});
