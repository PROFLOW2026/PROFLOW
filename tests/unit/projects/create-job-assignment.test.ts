import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, ValidationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

vi.mock('@/modules/clients', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(),
}));
vi.mock('@/modules/projects/application/create-project', () => ({
  createProject: vi.fn(),
}));
vi.mock('@/modules/workforce/application/project-team', () => ({
  addProjectTeamMember: vi.fn(),
}));
vi.mock('@/modules/workforce/data/employees.repository', () => ({
  findEmployeeById: vi.fn(),
}));

import { createClient } from '@/modules/clients';
import { createJob } from '@/modules/projects/application/create-job';
import { createProject } from '@/modules/projects/application/create-project';
import { noteModuleUsage } from '@/modules/tenancy';
import { addProjectTeamMember } from '@/modules/workforce/application/project-team';
import { findEmployeeById } from '@/modules/workforce/data/employees.repository';

const CLIENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROJECT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const EMPLOYEE_A = 'cccccccc-3333-4333-8333-333333333333';
const EMPLOYEE_B = 'dddddddd-4444-4444-8444-444444444444';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
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
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function employeeRow(id: string, archivedAt: Date | null = null) {
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
    archivedAt,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('createJob employee assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({ id: CLIENT_ID } as Awaited<
      ReturnType<typeof createClient>
    >);
    vi.mocked(createProject).mockResolvedValue({ projectId: PROJECT_ID, clientId: CLIENT_ID });
    vi.mocked(noteModuleUsage).mockResolvedValue(undefined as never);
    vi.mocked(addProjectTeamMember).mockResolvedValue({ id: 'assignment-1' } as Awaited<
      ReturnType<typeof addProjectTeamMember>
    >);
    vi.mocked(findEmployeeById).mockImplementation(async (_db, _org, employeeId) =>
      employeeId === EMPLOYEE_A || employeeId === EMPLOYEE_B ? employeeRow(employeeId) : null,
    );
  });

  it('creates a job without calling assignment when no employees are selected', async () => {
    const context = contextWith([PERMISSIONS.PROJECTS_CREATE]);
    await createJob(context, {
      name: 'AC fix',
      clientName: 'Dana',
      pricingMode: 'fixed',
      priceAmount: '4500',
      startDate: '2026-08-10',
      notes: 'Bring parts',
      workersNote: 'Dana and Avi',
    } as never);

    expect(createProject).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        workKind: 'job',
        notes: 'Bring parts',
      }),
    );
    expect(addProjectTeamMember).not.toHaveBeenCalled();
    expect(findEmployeeById).not.toHaveBeenCalled();
  });

  it('assigns selected employees through addProjectTeamMember (not labor Actual)', async () => {
    const context = contextWith([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.WORKFORCE_MANAGE]);
    await createJob(context, {
      name: 'AC fix',
      clientName: 'Dana',
      pricingMode: 'open',
      startDate: '2026-08-10',
      employeeIds: [EMPLOYEE_A, EMPLOYEE_B],
    });

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(addProjectTeamMember).toHaveBeenCalledTimes(2);
    expect(addProjectTeamMember).toHaveBeenNthCalledWith(1, context, {
      projectId: PROJECT_ID,
      employeeId: EMPLOYEE_A,
      startDate: '2026-08-10',
    });
    expect(addProjectTeamMember).toHaveBeenNthCalledWith(2, context, {
      projectId: PROJECT_ID,
      employeeId: EMPLOYEE_B,
      startDate: '2026-08-10',
    });
  });

  it('requires workforce.manage before creating when employeeIds are sent', async () => {
    const context = contextWith([PERMISSIONS.PROJECTS_CREATE]);
    await expect(
      createJob(context, {
        name: 'AC fix',
        clientName: 'Dana',
        pricingMode: 'open',
        startDate: '2026-08-10',
        employeeIds: [EMPLOYEE_A],
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(createProject).not.toHaveBeenCalled();
    expect(addProjectTeamMember).not.toHaveBeenCalled();
  });

  it('rejects unknown employees before create so assignment cannot invent a job then fail', async () => {
    const context = contextWith([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.WORKFORCE_MANAGE]);
    await expect(
      createJob(context, {
        name: 'AC fix',
        clientName: 'Dana',
        pricingMode: 'open',
        startDate: '2026-08-10',
        employeeIds: ['eeeeeeee-5555-4555-8555-555555555555'],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createProject).not.toHaveBeenCalled();
    expect(addProjectTeamMember).not.toHaveBeenCalled();
  });
});
