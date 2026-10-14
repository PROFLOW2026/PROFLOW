/**
 * S04 / 0184 — CRM tenant RLS aligned with crm.read / crm.manage (EXEC on PGlite + prepared SQL).
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import {
  applyPreparedMigrations,
  GATE_A_SEC_PREPARED_RLS,
} from '@tests/setup/pending-journal-migrations';
import { addOrgMember } from '@tests/setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';
import { CRM_RLS_TABLES, seedCrmGraph } from './crm-rls-fixtures';

async function countOrgRows(
  database: TestDatabase,
  userId: string,
  table: (typeof CRM_RLS_TABLES)[number],
  organizationId: string,
): Promise<number> {
  const rows = await database.asUser(userId, async (tx) =>
    resultRows<{ n: number }>(
      await tx.execute(
        sql.raw(
          `SELECT count(*)::int AS n FROM ${table} WHERE organization_id = '${organizationId}'::uuid`,
        ),
      ),
    ),
  );
  return rows[0]?.n ?? 0;
}

describe('CRM RLS permissions (0184 prepared)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_SEC_PREPARED_RLS);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('worker without crm.read sees zero rows across all nine CRM tables', async () => {
    const owner = await createTestUser(database, 'crm-rls-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM RLS Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'crm-worker', 'worker');
    await seedCrmGraph(database, tenant.organization.id);

    for (const table of CRM_RLS_TABLES) {
      await expect(countOrgRows(database, worker.id, table, tenant.organization.id)).resolves.toBe(0);
    }
  });

  it('finance (crm.read) can SELECT but cannot UPDATE opportunities', async () => {
    const owner = await createTestUser(database, 'crm-rls-finance-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM Finance Org');
    const finance = await addOrgMember(database, tenant.organization.id, 'crm-finance', 'finance');
    const seed = await seedCrmGraph(database, tenant.organization.id);

    expect(await countOrgRows(database, finance.id, 'crm_opportunities', tenant.organization.id)).toBe(
      1,
    );

    const updated = await database.asUser(finance.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`UPDATE crm_opportunities SET notes = 'blocked' WHERE organization_id = ${tenant.organization.id}::uuid AND id = ${seed.opportunityId}::uuid RETURNING id`,
        ),
      ),
    );
    expect(updated.length).toBe(0);
  });

  it('manager (crm.manage) can read and update opportunities', async () => {
    const owner = await createTestUser(database, 'crm-rls-manager-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM Manager Org');
    const manager = await addOrgMember(database, tenant.organization.id, 'crm-manager', 'manager');
    const seed = await seedCrmGraph(database, tenant.organization.id);

    expect(await countOrgRows(database, manager.id, 'crm_opportunities', tenant.organization.id)).toBe(
      1,
    );

    const updated = await database.asUser(manager.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`UPDATE crm_opportunities SET notes = 'manager edit' WHERE organization_id = ${tenant.organization.id}::uuid AND id = ${seed.opportunityId}::uuid RETURNING id`,
        ),
      ),
    );
    expect(updated.length).toBe(1);
  });
});
