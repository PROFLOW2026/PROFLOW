import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, ValidationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

vi.mock('@/modules/workforce/application/project-team', () => ({
  addProjectTeamMember: vi.fn(),
}));
vi.mock('@/modules/workforce/data/employees.repository', () => ({
  findEmployeeById: vi.fn(),
}));
vi.mock('@/modules/projects/application/project-access', () => ({
  canManageProjectAccess: vi.fn(),
  grantProjectAccess: vi.fn(),
}));

import { applyProjectCreateTeam } from '@/modules/projects/application/apply-project-create-team';
import {
  canManageProjectAccess,
  grantProjectAccess,
} from '@/modules/projects/application/project-access';
import { addProjectTeamMember } from '@/modules/workforce/application/project-team';
import { findEmployeeById } from '@/modules/workforce/data/employees.repository';

const PROJECT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const EMPLOYEE_A = 'cccccccc-3333-4333-8333-333333333333';
const EMPLOYEE_B = 'dddddddd-4444-4444-8444-444444444444';
const CREATOR_MEMBERSHIP = 'eeeeeeee-5555-4555-8555-555555555555';
const MEMBER_A = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_MEMBER = 'ffffffff-6666-4666-8666-666666666666';

function contextWith(permissions: readonly PermissionKey[], overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: CREATOR_MEMBERSHIP,
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
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ userId: USER_MEMBER, status: 'active' }]),
          }),
        }),
      }),
    } as unknown as OrgContext['db'],
    locale: 'he-IL',
    ...overrides,
  };
}

function employeeRow(id: string) {
  return {
    id,
    organizationId: 'org-1',
    name: 'Worker',
    status: 'active' as const,
    userId: null,
    employeeNumber: null,
    jobTitle: null,
    email: null,
    phone: null,
    notes: null,
    hireDate: null,
    endDate: null,
    employmentBasis: null,
    standardHoursPerDay: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('applyProjectCreateTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canManageProjectAccess).mockReturnValue(true);
    vi.mocked(addProjectTeamMember).mockResolvedValue({ id: 'assignment-1' } as Awaited<
      ReturnType<typeof addProjectTeamMember>
    >);
    vi.mocked(grantProjectAccess).mockResolvedValue({ id: 'grant-1' } as Awaited<
      ReturnType<typeof grantProjectAccess>
    >);
    vi.mocked(findEmployeeById).mockImplementation(async (_db, _org, employeeId) =>
      employeeId === EMPLOYEE_A || employeeId === EMPLOYEE_B ? employeeRow(employeeId) : null,
    );
  });

  it('does nothing when no team is selected', async () => {
    const context = contextWith([PERMISSIONS.WORKFORCE_MANAGE]);
    await applyProjectCreateTeam(context, PROJECT_ID, {});
    expect(addProjectTeamMember).not.toHaveBeenCalled();
    expect(grantProjectAccess).not.toHaveBeenCalled();
  });

  it('assigns PM and participants with workforce.manage', async () => {
    const context = contextWith([PERMISSIONS.WORKFORCE_MANAGE, PERMISSIONS.MEMBERS_MANAGE]);
    await applyProjectCreateTeam(context, PROJECT_ID, {
      projectManagerKey: `e:${EMPLOYEE_A}`,
      participantKeys: [`e:${EMPLOYEE_B}`, `m:${MEMBER_A}`],
    });

    expect(addProjectTeamMember).toHaveBeenCalledTimes(2);
    expect(addProjectTeamMember).toHaveBeenNthCalledWith(1, context, {
      projectId: PROJECT_ID,
      employeeId: EMPLOYEE_A,
      startDate: expect.any(String),
      role: 'project_manager',
    });
    expect(addProjectTeamMember).toHaveBeenNthCalledWith(2, context, {
      projectId: PROJECT_ID,
      employeeId: EMPLOYEE_B,
      startDate: expect.any(String),
      role: undefined,
    });
    expect(grantProjectAccess).toHaveBeenCalledWith(context, {
      userId: USER_MEMBER,
      projectId: PROJECT_ID,
      accessLevel: 'read',
    });
  });

  it('requires workforce.manage when team selections are present', async () => {
    const context = contextWith([PERMISSIONS.PROJECTS_CREATE]);
    await expect(
      applyProjectCreateTeam(context, PROJECT_ID, {
        participantKeys: [`e:${EMPLOYEE_A}`],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(addProjectTeamMember).not.toHaveBeenCalled();
  });

  it('skips creator employee already seeded by ensureProjectCreatorAccess', async () => {
    const context = contextWith([PERMISSIONS.WORKFORCE_MANAGE], {
      roleKeys: ['employee'],
      employeeApp: {
        employeeId: EMPLOYEE_A,
        account: {} as never,
        grants: new Map(),
        allowedDocumentCategories: null,
      },
    });

    await applyProjectCreateTeam(context, PROJECT_ID, {
      projectManagerKey: `e:${EMPLOYEE_A}`,
      participantKeys: [`e:${EMPLOYEE_B}`],
    });

    expect(addProjectTeamMember).toHaveBeenCalledTimes(1);
    expect(addProjectTeamMember).toHaveBeenCalledWith(context, {
      projectId: PROJECT_ID,
      employeeId: EMPLOYEE_B,
      startDate: expect.any(String),
      role: undefined,
    });
  });

  it('rejects unknown employees before assignment', async () => {
    const context = contextWith([PERMISSIONS.WORKFORCE_MANAGE]);
    await expect(
      applyProjectCreateTeam(context, PROJECT_ID, {
        participantKeys: ['e:99999999-9999-4999-8999-999999999999'],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(addProjectTeamMember).not.toHaveBeenCalled();
  });
});
