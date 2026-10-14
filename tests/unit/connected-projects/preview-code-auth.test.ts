import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { previewCode } from '@/modules/connected-projects/application/preview-code';

vi.mock('@/shared/db/service-role-write', () => ({
  asServiceRoleWrite: async (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/modules/connected-projects/data/connection.repository', () => ({
  findInvitationByCodeHash: vi.fn(),
}));

vi.mock('@/modules/connected-projects/application/load-engagement-preview', () => ({
  loadDeveloperEngagementPreview: vi.fn(async () => ({
    developerOrganizationId: 'dev',
    developerOrganizationName: 'Dev',
    developerProjectId: 'proj',
    developerProjectName: 'Site',
    subcontractAgreementId: 'agr',
    agreementTitle: null,
    agreementNumber: null,
    vendorName: 'V',
    scopeSummary: null,
    currency: 'ILS',
    contractNetAmount: null,
    startDate: null,
    targetEndDate: null,
    invitationExpiresAt: new Date('2026-12-01'),
  })),
}));

function context(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-b',
    membershipId: 'mem-1',
    locale: 'en',
    db: {} as OrgContext['db'],
    organization: { id: 'org-b', name: 'Contractor', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions: new Set(permissions),
    roleKeys: ['member'],
  };
}

const CODE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJK0123456789ab';

describe('previewCode auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires projects.create', async () => {
    await expect(previewCode(context([]), CODE)).rejects.toMatchObject({
      code: 'authorization_denied',
    });
  });

  it('allows members with projects.create', async () => {
    const { findInvitationByCodeHash } = await import(
      '@/modules/connected-projects/data/connection.repository'
    );
    const { hashConnectionCode } = await import('@/modules/connected-projects/domain/connection-code');
    vi.mocked(findInvitationByCodeHash).mockResolvedValue({
      id: 'inv-1',
      developerOrganizationId: 'dev',
      developerProjectId: 'proj',
      subcontractAgreementId: 'agr',
      vendorId: 'vendor',
      codeHash: hashConnectionCode(CODE),
      status: 'issued',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      consumedAt: null,
      revokedAt: null,
      issuedByUserId: null,
      consumedByOrganizationId: null,
      consumedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await previewCode(context([PERMISSIONS.PROJECTS_CREATE]), CODE);
    expect(result.preview.developerOrganizationName).toBe('Dev');
  });
});
