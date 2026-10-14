import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBillingRecord } from '@/modules/billing/application/create-billing-record';
import { updateBillingRecord } from '@/modules/billing/application/update-billing-record';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

describe('update billing lines (B01)', () => {
  let database: TestDatabase;
  let organizationId: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    const { orgA, userA } = await provisionTwoTenants(database);
    organizationId = orgA.organization.id;
    userId = userA.id;

    projectId = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const project = await createProject(context, { name: 'Line update job' });
      return project.projectId;
    });
  });

  it('draft amount edit replaces line net total', async () => {
    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });

      const draft = await createBillingRecord(context, {
        projectId,
        amount: '10000',
        issueDate: '2026-08-01',
        vatMode: 'exclusive',
        finalize: false,
      });

      expect(draft.lines[0]?.lineTotal.amount).toBe('10000.000000');

      const updated = await updateBillingRecord(context, {
        billingRecordId: draft.id,
        amount: '12000',
      });

      expect(updated.lines[0]?.lineTotal.amount).toBe('12000.000000');
      expect(updated.subtotalAmount.amount).toBe('12000.000000');
    });
  });
});
