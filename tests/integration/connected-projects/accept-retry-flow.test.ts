import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { randomUUID } from 'node:crypto';
import { createProject } from '@/modules/projects';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { createSubcontract, createVendor } from '@/modules/vendors';
import { acceptCode } from '@/modules/connected-projects/application/accept-code';
import { retryConnectedProjectProvisioning } from '@/modules/connected-projects/application/retry-provision';
import {
  generateConnectionCode,
  hashConnectionCode,
} from '@/modules/connected-projects/domain/connection-code';
import {
  insertEngagementConnectionInvitation,
  listFailedProvisioningMappingsForContractorOrg,
} from '@/modules/connected-projects/data/connection.repository';
import type { OrgContext } from '@/shared/auth/context';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

const provisionMock = vi.hoisted(() => ({
  provisionContractorProject: vi.fn(async (_context: OrgContext) => ({
    projectId: randomUUID(),
    clientId: randomUUID(),
  })),
}));

vi.mock('@/modules/connected-projects/application/provision-contractor-project', () => ({
  provisionContractorProject: provisionMock.provisionContractorProject,
}));

async function seedInvitation(database: TestDatabase) {
  await seedSystem(database);
  const devOwner = await createTestUser(database, 'dev-connect@example.test');
  const contractorOwner = await createTestUser(database, 'contractor-connect@example.test');
  const thirdOwner = await createTestUser(database, 'third-connect@example.test');

  const devOrg = await database.asService(async (db) =>
    createOrganization(db, devOwner.id, { name: 'Dev Org', countryCode: 'IL' }),
  );
  const contractorOrg = await database.asService(async (db) =>
    createOrganization(db, contractorOwner.id, { name: 'Contractor Org', countryCode: 'IL' }),
  );
  const thirdOrg = await database.asService(async (db) =>
    createOrganization(db, thirdOwner.id, { name: 'Third Org', countryCode: 'IL' }),
  );

  const engagement = await database.asUser(devOwner.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: devOwner.id,
      organizationId: devOrg.organization.id,
      locale: 'en',
    });
    const vendor = await createVendor(context, { name: 'Sub', type: 'subcontractor' });
    const { projectId } = await createProject(context, { name: 'Dev Site' });
    const agreement = await createSubcontract(context, {
      title: 'Package',
      vendorId: vendor.id,
      projectId,
      originalAmount: '100000',
    });
    return { vendorId: vendor.id, projectId, agreementId: agreement.id };
  });

  const code = generateConnectionCode();
  const invitationId = await database.asUser(devOwner.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: devOwner.id,
      organizationId: devOrg.organization.id,
      locale: 'en',
    });
    return asServiceRoleWrite(context.db, () =>
      insertEngagementConnectionInvitation(context.db, {
        developerOrganizationId: devOrg.organization.id,
        developerProjectId: engagement.projectId,
        subcontractAgreementId: engagement.agreementId,
        vendorId: engagement.vendorId,
        codeHash: hashConnectionCode(code),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        issuedByUserId: devOwner.id,
      }),
    );
  });

  return {
    code,
    invitationId,
    devOwner,
    contractorOwner,
    thirdOwner,
    devOrgId: devOrg.organization.id,
    contractorOrgId: contractorOrg.organization.id,
    thirdOrgId: thirdOrg.organization.id,
  };
}

describe('connected-projects accept + retry (PGlite)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    provisionMock.provisionContractorProject.mockReset();
    provisionMock.provisionContractorProject.mockImplementation(async (context: OrgContext) => {
      const { createClient } = await import('@/modules/clients');
      const { createProject } = await import('@/modules/projects');
      const client = await createClient(context, {
        name: 'Developer GC',
        legalName: 'Developer GC',
      });
      const { projectId } = await createProject(context, {
        name: 'Provisioned contractor project',
        clientId: client.id,
      });
      return {
        projectId: projectId as `${string}-${string}-${string}-${string}-${string}`,
        clientId: client.id as `${string}-${string}-${string}-${string}-${string}`,
      };
    });
  });

  it('accepts a code and provisions an active contractor project', async () => {
    const seed = await seedInvitation(database);
    const result = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });
    expect(result.provisioningFailed).not.toBe(true);
    expect(result.contractorProjectId).toBeTruthy();
    expect(result.idempotentReplay).toBe(false);
  });

  it('keeps failed mappings visible for retry when provisioning throws', async () => {
    const seed = await seedInvitation(database);
    provisionMock.provisionContractorProject.mockRejectedValueOnce(new Error('launch failed'));

    const failed = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });
    expect(failed.provisioningFailed).toBe(true);

    const visible = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return listFailedProvisioningMappingsForContractorOrg(context.db, seed.contractorOrgId);
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe(failed.mappingId);
  });

  it('rejects retry without projects.create', async () => {
    const seed = await seedInvitation(database);
    provisionMock.provisionContractorProject.mockRejectedValueOnce(new Error('launch failed'));
    const failed = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });

    await expect(
      database.asUser(seed.contractorOwner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: seed.contractorOwner.id,
          organizationId: seed.contractorOrgId,
          locale: 'en',
        });
        const narrowed: OrgContext = {
          ...context,
          permissions: new Set<PermissionKey>(),
        };
        return retryConnectedProjectProvisioning(narrowed, failed.mappingId);
      }),
    ).rejects.toMatchObject({ code: 'authorization_denied' });
  });

  it('returns NotFound when another org retries a foreign mapping id', async () => {
    const seed = await seedInvitation(database);
    provisionMock.provisionContractorProject.mockRejectedValueOnce(new Error('launch failed'));
    const failed = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });

    await expect(
      database.asUser(seed.thirdOwner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: seed.thirdOwner.id,
          organizationId: seed.thirdOrgId,
          locale: 'en',
        });
        return retryConnectedProjectProvisioning(context, failed.mappingId);
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('replays idempotently for the same org and code', async () => {
    const seed = await seedInvitation(database);
    const first = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });
    const second = await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });
    expect(second.idempotentReplay).toBe(true);
    expect(second.contractorProjectId).toBe(first.contractorProjectId);
  });

  it('rejects a second org consuming the same code', async () => {
    const seed = await seedInvitation(database);
    await database.asUser(seed.contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: seed.contractorOwner.id,
        organizationId: seed.contractorOrgId,
        locale: 'en',
      });
      return acceptCode(context, { code: seed.code, confirmOrganization: true });
    });

    await expect(
      database.asUser(seed.thirdOwner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: seed.thirdOwner.id,
          organizationId: seed.thirdOrgId,
          locale: 'en',
        });
        return acceptCode(context, { code: seed.code, confirmOrganization: true });
      }),
    ).rejects.toMatchObject({ messageKey: 'connectedProjects.errors.code_consumed' });
  });
});
