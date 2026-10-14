import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { crossOrgSyncOutbox } from '@drizzle/schema';
import {
  createApBill,
  enableApPaymentsPersistenceForTests,
  disableApPaymentsPersistenceForTests,
  recordVendorPayment,
} from '@/modules/ap';
import { CONTRACT_VALUE_SYNC_EVENT_TYPES } from '@/modules/connected-projects/application/sync-contract-value-projection';
import { createDraftAgreement } from '@/modules/subcontracts';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';
import { createOrganization } from '@/modules/tenancy';
import { classifyApBillLines, findCostCategoryId } from '@tests/setup/cost-category-fixtures';
import {
  applyPreparedMigrations,
  GATE_A_CONNECT_PREPARED_K08,
  GATE_A_PG_LITE_SCHEMA_PARITY,
} from '../../setup/pending-journal-migrations';

describe('K08 payment reported sync outbox', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    enableApPaymentsPersistenceForTests();
    await applyPreparedMigrations(database, GATE_A_PG_LITE_SCHEMA_PARITY);
  });
  afterAll(async () => {
    disableApPaymentsPersistenceForTests();
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    enableApPaymentsPersistenceForTests();
    await applyPreparedMigrations(database, GATE_A_CONNECT_PREPARED_K08);
  });

  it(
    'enqueues subcontract.payment.reported.sync when paying a subcontract AP bill',
    async () => {
    await seedSystem(database);
    const devOwner = await createTestUser(database, 'k08-pay-dev@example.test');
    const contractorOwner = await createTestUser(database, 'k08-pay-sub@example.test');
    const devOrg = await database.asService((db) =>
      createOrganization(db, devOwner.id, { name: 'K08 Pay Dev', countryCode: 'IL' }),
    );
    const contractorOrg = await database.asService((db) =>
      createOrganization(db, contractorOwner.id, { name: 'K08 Pay Contractor', countryCode: 'IL' }),
    );
    const costCategoryId = await findCostCategoryId(database, devOrg.organization.id);

    const seed = await database.asUser(devOwner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: devOwner.id,
        organizationId: devOrg.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Linked Sub', type: 'subcontractor' });
      const { projectId } = await createProject(context, { name: 'Dev tower' });
      const { agreementId } = await createDraftAgreement(context, {
        title: 'Shell works',
        vendorId: vendor.id,
        projectId,
        originalAmount: '50000',
      });
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        projectId,
        subcontractAgreementId: agreementId,
        currency: 'ILS',
        totalAmount: '10000',
        billDate: '2030-02-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Progress',
              quantity: '1',
              unitAmount: '10000',
              lineTotal: '10000',
              currency: 'ILS',
            },
          ],
          costCategoryId,
        ),
      });
      return { projectId, agreementId, vendorId: vendor.id, billId: bill.id };
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
          ${seed.projectId}::uuid,
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
      await recordVendorPayment(context, {
        vendorId: seed.vendorId,
        amount: '2500',
        currency: 'ILS',
        paymentDate: '2030-02-15',
        applications: [{ apBillId: seed.billId, appliedAmount: '2500' }],
      });
    });

    const rows = await database.asService((db) =>
      db
        .select({
          eventType: crossOrgSyncOutbox.eventType,
          idempotencyKey: crossOrgSyncOutbox.idempotencyKey,
        })
        .from(crossOrgSyncOutbox)
        .where(eq(crossOrgSyncOutbox.mappingId, mappingId)),
    );
    expect(rows.some((row) => row.eventType === CONTRACT_VALUE_SYNC_EVENT_TYPES.paymentReported)).toBe(
      true,
    );
    expect(rows.some((row) => row.idempotencyKey.includes(seed.billId))).toBe(true);
    },
    180_000,
  );
});
