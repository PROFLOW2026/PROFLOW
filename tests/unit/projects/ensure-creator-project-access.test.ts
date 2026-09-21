import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

vi.mock('@/modules/workforce/data/project-team.repository', () => ({
  insertEmployeeProjectAssignment: vi.fn(),
}));
vi.mock('@/modules/projects/data/project-access.repository', () => ({
  getStoredProjectAccessMode: vi.fn(),
  insertProjectAccessGrant: vi.fn(),
}));
vi.mock('@/shared/audit', () => ({
  recordAuditEvent: vi.fn(),
  AUDIT_ACTIONS: {
    PROJECT_TEAM_MEMBER_ADDED: 'project_team.member_added',
    PROJECT_ACCESS_GRANTED: 'project_access.granted',
  },
}));

import { insertEmployeeProjectAssignment } from '@/modules/workforce/data/project-team.repository';
import {
  getStoredProjectAccessMode,
  insertProjectAccessGrant,
} from '@/modules/projects/data/project-access.repository';
import { ensureProjectCreatorAccess } from '@/modules/projects/application/ensure-creator-project-access';

const PROJECT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const EMPLOYEE_ID = 'cccccccc-3333-4333-8333-333333333333';

function baseContext(overrides: Partial<OrgContext> = {}): OrgContext {
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
    permissions: new Set<typeof PERMISSIONS[keyof typeof PERMISSIONS]>(),
    roleKeys: ['employee'],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
    employeeApp: {
      employeeId: EMPLOYEE_ID,
      account: {} as never,
      grants: new Map(),
      allowedDocumentCategories: null,
    },
    ...overrides,
  };
}

describe('ensureProjectCreatorAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertEmployeeProjectAssignment).mockResolvedValue({
      id: 'assignment-1',
      organizationId: 'org-1',
      projectId: PROJECT_ID,
      employeeId: EMPLOYEE_ID,
      startDate: '2026-09-21',
      endDate: null,
      role: null,
      plannedAllocationPercent: null,
      notes: null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(getStoredProjectAccessMode).mockResolvedValue('selected');
    vi.mocked(insertProjectAccessGrant).mockResolvedValue({
      id: 'grant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      projectId: PROJECT_ID,
      accessLevel: 'manage',
    });
  });

  it('assigns employee app creator via employee_project_assignments', async () => {
    await ensureProjectCreatorAccess(baseContext(), PROJECT_ID);

    expect(insertEmployeeProjectAssignment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: PROJECT_ID,
        employeeId: EMPLOYEE_ID,
        status: 'active',
      }),
    );
    expect(insertProjectAccessGrant).not.toHaveBeenCalled();
  });

  it('grants project_access for scoped main-app creator without access_all', async () => {
    const context = baseContext({
      roleKeys: ['member'],
      employeeApp: undefined,
      permissions: new Set([PERMISSIONS.PROJECTS_CREATE]),
    });

    await ensureProjectCreatorAccess(context, PROJECT_ID);

    expect(insertProjectAccessGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        projectId: PROJECT_ID,
        accessLevel: 'manage',
      }),
    );
    expect(insertEmployeeProjectAssignment).not.toHaveBeenCalled();
  });

  it('skips grant when user already has projects.access_all', async () => {
    const context = baseContext({
      roleKeys: ['member'],
      employeeApp: undefined,
      permissions: new Set([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.PROJECTS_ACCESS_ALL]),
    });

    await ensureProjectCreatorAccess(context, PROJECT_ID);

    expect(insertProjectAccessGrant).not.toHaveBeenCalled();
    expect(insertEmployeeProjectAssignment).not.toHaveBeenCalled();
  });
});
