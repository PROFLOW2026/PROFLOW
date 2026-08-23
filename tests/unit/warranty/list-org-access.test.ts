import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const listCoveragesForOrg = vi.fn();
const listIssuesByCoverageIds = vi.fn();
const resolveAccessibleProjectIds = vi.fn();

vi.mock('@/modules/warranty/data/warranty.repository', () => ({
  listCoveragesForOrg: (...args: unknown[]) => listCoveragesForOrg(...args),
  listIssuesByCoverageIds: (...args: unknown[]) => listIssuesByCoverageIds(...args),
  findCoverageById: vi.fn(),
  insertCoverage: vi.fn(),
  listCoveragesByProject: vi.fn(),
  updateCoverageById: vi.fn(),
}));

import type * as ProjectsModule from '@/modules/projects';

vi.mock('@/modules/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectsModule>();
  return {
    ...actual,
    resolveAccessibleProjectIds: (...args: unknown[]) => resolveAccessibleProjectIds(...args),
    assertCanAccessProject: vi.fn(),
    findProjectById: vi.fn(),
    findWorkPackageById: vi.fn(),
  };
});

import { listOrgWarrantyCoverages } from '@/modules/warranty/application/coverages';

function contextWith(permissions: readonly string[]): OrgContext {
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
    permissions: new Set(permissions) as OrgContext['permissions'],
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('listOrgWarrantyCoverages project access', () => {
  beforeEach(() => {
    listCoveragesForOrg.mockReset();
    listIssuesByCoverageIds.mockReset().mockResolvedValue([]);
    resolveAccessibleProjectIds.mockReset();
  });

  it('returns all org rows when project access is unrestricted', async () => {
    resolveAccessibleProjectIds.mockResolvedValue(null);
    listCoveragesForOrg.mockResolvedValue([
      {
        coverage: {
          id: 'cov-a',
          organizationId: 'org-1',
          projectId: 'proj-a',
          workPackageId: null,
          vendorId: null,
          coverageType: 'workmanship',
          title: 'Coverage A',
          notes: null,
          startDate: null,
          endDate: null,
          status: 'active',
          reminderDaysBefore: 30,
          archivedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        projectName: 'Project A',
        projectStatus: 'active',
      },
      {
        coverage: {
          id: 'cov-b',
          organizationId: 'org-1',
          projectId: 'proj-b',
          workPackageId: null,
          vendorId: null,
          coverageType: 'workmanship',
          title: 'Coverage B',
          notes: null,
          startDate: null,
          endDate: null,
          status: 'active',
          reminderDaysBefore: 30,
          archivedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        projectName: 'Project B',
        projectStatus: 'active',
      },
    ]);

    const rows = await listOrgWarrantyCoverages(contextWith([PERMISSIONS.PROJECTS_READ]));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(['cov-a', 'cov-b']);
  });

  it('filters to accessible project ids only', async () => {
    resolveAccessibleProjectIds.mockResolvedValue(['proj-a']);
    listCoveragesForOrg.mockResolvedValue([
      {
        coverage: {
          id: 'cov-a',
          organizationId: 'org-1',
          projectId: 'proj-a',
          workPackageId: null,
          vendorId: null,
          coverageType: 'workmanship',
          title: 'Coverage A',
          notes: null,
          startDate: null,
          endDate: null,
          status: 'active',
          reminderDaysBefore: 30,
          archivedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        projectName: 'Project A',
        projectStatus: 'active',
      },
      {
        coverage: {
          id: 'cov-b',
          organizationId: 'org-1',
          projectId: 'proj-b',
          workPackageId: null,
          vendorId: null,
          coverageType: 'workmanship',
          title: 'Coverage B',
          notes: null,
          startDate: null,
          endDate: null,
          status: 'active',
          reminderDaysBefore: 30,
          archivedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        projectName: 'Project B',
        projectStatus: 'active',
      },
    ]);

    const rows = await listOrgWarrantyCoverages(contextWith([PERMISSIONS.PROJECTS_READ]));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('cov-a');
    expect(rows[0]?.projectName).toBe('Project A');
  });

  it('returns empty when the user has no accessible projects', async () => {
    resolveAccessibleProjectIds.mockResolvedValue([]);
    listCoveragesForOrg.mockResolvedValue([
      {
        coverage: {
          id: 'cov-a',
          organizationId: 'org-1',
          projectId: 'proj-a',
          workPackageId: null,
          vendorId: null,
          coverageType: 'workmanship',
          title: 'Coverage A',
          notes: null,
          startDate: null,
          endDate: null,
          status: 'active',
          reminderDaysBefore: 30,
          archivedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        projectName: 'Project A',
        projectStatus: 'active',
      },
    ]);

    const rows = await listOrgWarrantyCoverages(contextWith([PERMISSIONS.PROJECTS_READ]));

    expect(rows).toEqual([]);
    expect(listIssuesByCoverageIds).toHaveBeenCalledWith({}, 'org-1', []);
  });
});
