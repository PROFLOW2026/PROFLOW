import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hashConnectionCode } from '@/modules/connected-projects/domain/connection-code';
import { acceptCode } from '@/modules/connected-projects/application/accept-code';

const INVITATION_ID = '11111111-1111-4111-8111-111111111111';
const MAPPING_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const CONTRACTOR_ORG = '44444444-4444-4444-8444-444444444444';
const CODE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJK0123456789ab';

const adminDb = {};

const repo = vi.hoisted(() => ({
  findInvitationByCodeHash: vi.fn(),
  findMappingByInvitationAndContractorOrg: vi.fn(),
  findActiveMappingByAgreementAndContractorOrg: vi.fn(),
  markInvitationConsumed: vi.fn(),
  insertConnectedProjectMapping: vi.fn(),
  updateMappingProvisioning: vi.fn(),
}));

vi.mock('@/shared/db/client', () => ({
  getAdminDb: () => adminDb,
}));

vi.mock('@/shared/db/service-role-write', () => ({
  asServiceRoleWrite: async (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/shared/audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/modules/connected-projects/data/connection.repository', () => repo);

vi.mock('@/modules/connected-projects/application/load-engagement-preview', () => ({
  loadDeveloperEngagementPreview: vi.fn(async () => ({
    developerOrganizationId: 'dev-org',
    developerOrganizationName: 'Developer',
    developerProjectId: 'dev-proj',
    developerProjectName: 'Site',
    subcontractAgreementId: 'agr',
    agreementTitle: 'Sub',
    agreementNumber: '1',
    vendorName: 'Vendor',
    scopeSummary: null,
    currency: 'ILS',
    contractNetAmount: '1000',
    startDate: null,
    targetEndDate: null,
    invitationExpiresAt: new Date('2026-12-01'),
  })),
}));

vi.mock('@/modules/connected-projects/application/provision-contractor-project', () => ({
  provisionContractorProject: vi.fn(async () => ({
    projectId: PROJECT_ID,
    clientId: 'client-1',
  })),
}));

function orgContext(): OrgContext {
  return {
    userId: 'user-1',
    organizationId: CONTRACTOR_ORG,
    membershipId: 'mem-1',
    locale: 'en',
    db: {} as OrgContext['db'],
    organization: { id: CONTRACTOR_ORG, name: 'Contractor', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions: new Set([PERMISSIONS.PROJECTS_CREATE]),
    roleKeys: ['admin'],
  };
}

function invitation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVITATION_ID,
    developerOrganizationId: 'dev-org',
    developerProjectId: 'dev-proj',
    subcontractAgreementId: 'agr',
    vendorId: 'vendor',
    codeHash: hashConnectionCode(CODE),
    status: 'issued' as const,
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    consumedAt: null,
    revokedAt: null,
    consumedByOrganizationId: null,
    consumedByUserId: null,
    issuedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('acceptCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findActiveMappingByAgreementAndContractorOrg.mockResolvedValue(null);
    repo.markInvitationConsumed.mockResolvedValue(true);
    repo.insertConnectedProjectMapping.mockResolvedValue(MAPPING_ID);
    repo.updateMappingProvisioning.mockResolvedValue(undefined);
  });

  it('rejects expired codes when no mapping exists yet', async () => {
    repo.findInvitationByCodeHash.mockResolvedValue(
      invitation({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    );
    repo.findMappingByInvitationAndContractorOrg.mockResolvedValue(null);

    await expect(acceptCode(orgContext(), { code: CODE, confirmOrganization: true })).rejects.toMatchObject({
      messageKey: 'connectedProjects.errors.code_expired',
    });
  });

  it('returns idempotent replay when mapping is already active with a project id', async () => {
    repo.findInvitationByCodeHash.mockResolvedValue(invitation());
    repo.findMappingByInvitationAndContractorOrg.mockResolvedValue({
      id: MAPPING_ID,
      invitationId: INVITATION_ID,
      developerOrganizationId: 'dev-org',
      developerProjectId: 'dev-proj',
      subcontractAgreementId: 'agr',
      contractorOrganizationId: CONTRACTOR_ORG,
      contractorProjectId: PROJECT_ID,
      contractorClientId: 'client-1',
      status: 'active',
      connectionVersion: 1,
      provisioningStatus: 'succeeded',
      acceptedByUserId: 'user-1',
      acceptedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await acceptCode(orgContext(), { code: CODE, confirmOrganization: true });

    expect(result).toEqual({
      mappingId: MAPPING_ID,
      contractorProjectId: PROJECT_ID,
      idempotentReplay: true,
    });
    expect(repo.insertConnectedProjectMapping).not.toHaveBeenCalled();
    expect(repo.updateMappingProvisioning).not.toHaveBeenCalled();
  });
});
