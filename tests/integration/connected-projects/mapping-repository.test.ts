import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createSubcontract, createVendor } from '@/modules/vendors';
import { findConnectedProjectMappingForContractorProject } from '@/modules/connected-projects/data/mapping.repository';
import { resolveConnectedContext } from '@/modules/connected-projects/application/resolve-connected-context';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';
import { createOrganization } from '@/modules/tenancy';

async function seedDeveloperContractorLink(database: TestDatabase) {
  await seedSystem(database);
  const devOwner = await createTestUser(database, 'dev-owner@example.test');
  const contractorOwner = await createTestUser(database, 'contractor-owner@example.test');
  const devOrg = await database.asService(async (db) =>
    createOrganization(db, devOwner.id, { name: 'Developer GC', countryCode: 'IL' }),
  );
  const contractorOrg = await database.asService(async (db) =>
    createOrganization(db, contractorOwner.id, { name: 'Contractor Co', countryCode: 'IL' }),
  );

  const seed = await database.asUser(devOwner.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: devOwner.id,
      organizationId: devOrg.organization.id,
      locale: 'en',
    });
    const vendor = await createVendor(context, { name: 'Site Sub', type: 'subcontractor' });
    const { projectId: developerProjectId } = await createProject(context, { name: 'Tower' });
    const agreement = await createSubcontract(context, {
      title: 'Electrical',
      vendorId: vendor.id,
      projectId: developerProjectId,
      originalAmount: '500000',
    });
    return { vendorId: vendor.id, developerProjectId, agreementId: agreement.id };
  });

  const contractorProjectId = await database.asUser(contractorOwner.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: contractorOwner.id,
      organizationId: contractorOrg.organization.id,
      locale: 'en',
    });
    const { projectId } = await createProject(context, { name: 'Linked job' });
    return projectId;
  });

  const mappingId = randomUUID();
  await database.asService(async (db) => {
    await db.execute(sql`
      insert into connected_project_mappings (
        id,
        developer_organization_id,
        developer_project_id,
        subcontract_agreement_id,
        contractor_organization_id,
        contractor_project_id,
        status,
        provisioning_status,
        connection_version,
        accepted_at
      ) values (
        ${mappingId}::uuid,
        ${devOrg.organization.id}::uuid,
        ${seed.developerProjectId}::uuid,
        ${seed.agreementId}::uuid,
        ${contractorOrg.organization.id}::uuid,
        ${contractorProjectId}::uuid,
        'active',
        'succeeded',
        1,
        now()
      )
    `);
  });

  return {
    devOwner,
    contractorOwner,
    devOrgId: devOrg.organization.id,
    contractorOrgId: contractorOrg.organization.id,
    contractorProjectId,
    vendorId: seed.vendorId,
    mappingId,
  };
}

describe('connected-projects mapping repository (PGlite + 0179)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('returns vendor id from subcontract agreement join for active mappings', async () => {
    const link = await seedDeveloperContractorLink(database);
    const mapping = await database.asService((db) =>
      findConnectedProjectMappingForContractorProject(db, {
        contractorOrganizationId: link.contractorOrgId,
        contractorProjectId: link.contractorProjectId,
      }),
    );
    expect(mapping).not.toBeNull();
    expect(mapping!.vendorId).toBe(link.vendorId);
    expect(mapping!.status).toBe('active');
  });

  it('returns null for failed or revoked mappings', async () => {
    const link = await seedDeveloperContractorLink(database);
    await database.asService(async (db) => {
      await db.execute(sql`
        update connected_project_mappings
        set status = 'failed', provisioning_status = 'failed'
        where id = ${link.mappingId}::uuid
      `);
    });
    const failed = await database.asService((db) =>
      findConnectedProjectMappingForContractorProject(db, {
        contractorOrganizationId: link.contractorOrgId,
        contractorProjectId: link.contractorProjectId,
      }),
    );
    expect(failed).toBeNull();
  });

  it('returns null with a warning when the schema table is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mapping = await findConnectedProjectMappingForContractorProject(
      {
        execute: async () => {
          throw Object.assign(new Error('missing'), { code: '42P01' });
        },
      } as never,
      { contractorOrganizationId: randomUUID(), contractorProjectId: randomUUID() },
    );
    expect(mapping).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[connected-projects] schema-missing'));
    warn.mockRestore();
  });

  it('rethrows when a column is missing (42703)', async () => {
    await expect(
      findConnectedProjectMappingForContractorProject(
        {
          execute: async () => {
            throw Object.assign(new Error('column'), { code: '42703' });
          },
        } as never,
        { contractorOrganizationId: randomUUID(), contractorProjectId: randomUUID() },
      ),
    ).rejects.toMatchObject({ code: '42703' });
  });

  it('resolveConnectedContext finds mapping via admin executor', async () => {
    const link = await seedDeveloperContractorLink(database);
    const resolved = await database.asService((db) =>
      resolveConnectedContext({
        contractorOrganizationId: link.contractorOrgId,
        contractorProjectId: link.contractorProjectId,
        authUserId: link.contractorOwner.id,
        fallbackLocale: 'en',
        mappingDb: db,
      }),
    );
    expect(resolved?.mapping.id).toBe(link.mappingId);
    expect(resolved?.developer.vendorId).toBe(link.vendorId);
  });
});
