import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { subcontractAgreements, subcontractValueEvents } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createSubcontract, createVendor } from '@/modules/vendors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { createOrganization } from '@/modules/tenancy';
import { applyPreparedMigrations, GATE_A_PG_LITE_SCHEMA_PARITY } from '@tests/setup/pending-journal-migrations';

describe('K05 canonical subcontract writer', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_PG_LITE_SCHEMA_PARITY);
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
  });

  it('records a single original value event only after activate via vendor create path', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'vendor-sub-owner@example.test');
    const org = await database.asService((db) =>
      createOrganization(db, owner.id, { name: 'Vendor Sub Org', countryCode: 'IL' }),
    );

    const created = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Sub Co', type: 'subcontractor' });
      const { projectId } = await createProject(context, { name: 'Site' });
      const detail = await createSubcontract(context, {
        title: 'Electrical',
        vendorId: vendor.id,
        projectId,
        originalAmount: '120000',
      });
      return { agreementId: detail.id };
    });

    const [agreement] = await database.asService((db) =>
      db
        .select({ status: subcontractAgreements.status })
        .from(subcontractAgreements)
        .where(eq(subcontractAgreements.id, created.agreementId)),
    );
    expect(agreement?.status).toBe('active');

    const events = await database.asService((db) =>
      db
        .select({ kind: subcontractValueEvents.kind })
        .from(subcontractValueEvents)
        .where(eq(subcontractValueEvents.subcontractId, created.agreementId)),
    );
    expect(events).toEqual([{ kind: 'original' }]);
  });
});
