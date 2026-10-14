import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { connectedContractValueProjections, crossOrgSyncOutbox } from '@drizzle/schema';
import { changeAgreementStatus, createDraftAgreement } from '@/modules/subcontracts';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import {
  applyContractValueProjectionUpsert,
  CONTRACT_VALUE_SYNC_EVENT_TYPES,
} from '@/modules/connected-projects/application/sync-contract-value-projection';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';
import { createOrganization } from '@/modules/tenancy';
import {
  applyPreparedMigrations,
  GATE_A_CONNECT_PREPARED_K08,
  GATE_A_PG_LITE_SCHEMA_PARITY,
} from '../../setup/pending-journal-migrations';

describe('K08 connected contract value projections', () => {
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
    await applyPreparedMigrations(database, GATE_A_CONNECT_PREPARED_K08);
  });

  it('delivers agreement activation into contractor projections idempotently', async () => {
    await seedSystem(database);
    const devOwner = await createTestUser(database, 'k08-dev@example.test');
    const contractorOwner = await createTestUser(database, 'k08-sub@example.test');
    const devOrg = await database.asService((db) =>
      createOrganization(db, devOwner.id, { name: 'K08 Dev', countryCode: 'IL' }),
    );
    const contractorOrg = await database.asService((db) =>
      createOrganization(db, contractorOwner.id, { name: 'K08 Contractor', countryCode: 'IL' }),
    );

    const seed = await database.asUser(devOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: devOwner.id,
        organizationId: devOrg.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Linked Sub', type: 'subcontractor' });
      const { projectId: developerProjectId } = await createProject(context, { name: 'Dev tower' });
      const { agreementId } = await createDraftAgreement(context, {
        title: 'Shell works',
        vendorId: vendor.id,
        projectId: developerProjectId,
        originalAmount: '900000',
      });
      return { developerProjectId, agreementId };
    });

    const contractorProjectId = await database.asUser(contractorOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: contractorOwner.id,
        organizationId: contractorOrg.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Contractor mirror' });
      return projectId;
    });

    const mappingId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`
        insert into connected_project_mappings (
          id, developer_organization_id, developer_project_id, subcontract_agreement_id,
          contractor_organization_id, contractor_project_id, status, provisioning_status, connection_version, accepted_at
        ) values (
          ${mappingId}::uuid,
          ${devOrg.organization.id}::uuid,
          ${seed.developerProjectId}::uuid,
          ${seed.agreementId}::uuid,
          ${contractorOrg.organization.id}::uuid,
          ${contractorProjectId}::uuid,
          'active', 'succeeded', 1, now()
        )
      `);
    });

    await database.asUser(devOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: devOwner.id,
        organizationId: devOrg.organization.id,
        locale: 'en',
      });
      await changeAgreementStatus(context, { agreementId: seed.agreementId, action: 'activate' });
    });

    const idempotencyKey = `${CONTRACT_VALUE_SYNC_EVENT_TYPES.agreementValue}:${mappingId}:${seed.agreementId}:1`;
    await database.asService(async (db) => {
      await db.insert(crossOrgSyncOutbox).values({
        mappingId,
        developerOrganizationId: devOrg.organization.id,
        eventType: CONTRACT_VALUE_SYNC_EVENT_TYPES.agreementValue,
        idempotencyKey,
        payload: {
          subcontractAgreementId: seed.agreementId,
          sourceKind: 'agreement_value',
          sourceId: seed.agreementId,
          amountNet: '900000',
          currency: 'ILS',
          effectiveDate: '2030-01-15',
          sourceVersion: 1,
        },
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date('2030-01-01T00:00:00.000Z'),
      });
    });

    await database.asService(async (db) => {
      await applyContractValueProjectionUpsert(db, {
        mappingId,
        contractorOrganizationId: contractorOrg.organization.id,
        contractorProjectId,
        idempotencyKey,
        payload: {
          sourceKind: 'agreement_value',
          sourceId: seed.agreementId,
          amountNet: '900000',
          currency: 'ILS',
          effectiveDate: '2030-01-15',
        },
      });
      await applyContractValueProjectionUpsert(db, {
        mappingId,
        contractorOrganizationId: contractorOrg.organization.id,
        contractorProjectId,
        idempotencyKey,
        payload: {
          sourceKind: 'agreement_value',
          sourceId: seed.agreementId,
          amountNet: '900000',
          currency: 'ILS',
          effectiveDate: '2030-01-15',
        },
      });
    });

    const projections = await database.asService((db) =>
      db
        .select({
          amountNet: connectedContractValueProjections.amountNet,
          sourceKind: connectedContractValueProjections.sourceKind,
        })
        .from(connectedContractValueProjections)
        .where(eq(connectedContractValueProjections.mappingId, mappingId)),
    );
    expect(projections.length).toBeGreaterThan(0);
    expect(projections.every((row) => row.sourceKind === 'agreement_value')).toBe(true);
  });
});
