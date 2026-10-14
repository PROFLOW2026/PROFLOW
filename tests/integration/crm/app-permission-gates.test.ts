/**
 * S04 — Application-layer CRM gates (independent of Gate B SQL apply).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listOpportunitiesForOrg } from '@/modules/crm';
import { resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember } from '@tests/setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';

describe('CRM application permission gates', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('worker role is denied listOpportunitiesForOrg at the app layer', async () => {
    const owner = await createTestUser(database, 'crm-app-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM App Gate Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'crm-app-worker', 'worker');

    await expect(
      database.asUser(worker.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: worker.id,
          organizationId: tenant.organization.id,
          locale: 'en',
        });
        await listOpportunitiesForOrg(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('finance role can list opportunities via the app layer', async () => {
    const owner = await createTestUser(database, 'crm-app-finance-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM App Finance Org');
    const finance = await addOrgMember(database, tenant.organization.id, 'crm-app-finance', 'finance');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: tenant.organization.id,
        locale: 'en',
      });
      const { createOpportunity } = await import('@/modules/crm');
      await createOpportunity(context, { name: 'Finance-visible deal' });
    });

    const listed = await database.asUser(finance.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: finance.id,
        organizationId: tenant.organization.id,
        locale: 'en',
      });
      return listOpportunitiesForOrg(context);
    });
    expect(listed.length).toBe(1);
  });
});
