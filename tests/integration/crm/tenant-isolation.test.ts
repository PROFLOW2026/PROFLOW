/**
 * C02-003 / C02-017 — CRM cross-tenant isolation (app + RLS with 0184 prepared).
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getOpportunityById } from '@/modules/crm';
import { resolveOrgContext } from '@/modules/tenancy';
import { NotFoundError } from '@/shared/errors';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import {
  applyPreparedMigrations,
  GATE_A_SEC_PREPARED_RLS,
} from '@tests/setup/pending-journal-migrations';
import { provisionTwoTenants } from '../clients/setup';
import { seedCrmGraph } from './crm-rls-fixtures';

describe('CRM tenant isolation (0184 prepared)', () => {
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
  });

  it('org B manager cannot raw SELECT org A CRM rows', async () => {
    const { orgA, userB } = await provisionTwoTenants(database);
    const seed = await seedCrmGraph(database, orgA.organization.id);

    const rows = await database.asUser(userB.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM crm_opportunities WHERE organization_id = ${orgA.organization.id}::uuid`,
        ),
      ),
    );
    expect(rows.length).toBe(0);

    const byId = await database.asUser(userB.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM crm_opportunities WHERE id = ${seed.opportunityId}::uuid`,
        ),
      ),
    );
    expect(byId.length).toBe(0);
  });

  it('org B app context cannot load org A opportunity by id', async () => {
    const { orgA, orgB, userB } = await provisionTwoTenants(database);
    const seed = await seedCrmGraph(database, orgA.organization.id);

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        await getOpportunityById(context, seed.opportunityId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
