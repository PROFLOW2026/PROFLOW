import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { organizationMemberships } from '@drizzle/schema';
import { createBillingRecord } from '@/modules/billing';
import { recordPayment } from '@/modules/billing/application/record-payment';
import { createClient, getClientFinancials } from '@/modules/clients';
import { createProject } from '@/modules/projects';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { createTestUser } from '@tests/setup/fixtures';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('client financials', () => {
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

  it('aggregates only billing for the requested client in the active organization', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const result = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const alpha = await createClient(context, { name: 'Alpha Ltd' });
      const beta = await createClient(context, { name: 'Beta Ltd' });
      const alphaProject = await createProject(context, {
        name: 'Alpha job',
        clientId: alpha.id,
      });
      const betaProject = await createProject(context, {
        name: 'Beta job',
        clientId: beta.id,
      });
      const billed = await createBillingRecord(context, {
        projectId: alphaProject.projectId,
        amount: '1000',
        issueDate: '2026-08-01',
        dueDate: '2026-08-20',
        finalize: true,
      });
      await recordPayment(context, {
        billingRecordId: billed.id,
        amount: '400',
        paymentDate: '2026-08-05',
      });
      await createBillingRecord(context, {
        projectId: betaProject.projectId,
        amount: '5000',
        issueDate: '2026-08-01',
        finalize: true,
      });
      const financials = await getClientFinancials(context, alpha.id);
      return { alphaId: alpha.id, financials };
    });

    expect(result.financials.snapshot.invoiced.amount).toBe('1000.000000');
    expect(result.financials.snapshot.paid.amount).toBe('400.000000');
    expect(result.financials.snapshot.outstanding.amount).toBe('600.000000');
    expect(result.financials.recentBilling).toHaveLength(1);
    expect(result.financials.recentPayments).toHaveLength(1);
  });

  it('prevents org B from reading org A client financials', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const clientId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Secret Client' });
      const project = await createProject(context, {
        name: 'Secret job',
        clientId: client.id,
      });
      await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '8800',
        issueDate: '2026-08-01',
        finalize: true,
      });
      return client.id;
    });

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        return getClientFinancials(context, clientId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('hides client financials from a worker without billing.read', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const worker = await createTestUser(database, `client-worker-${Date.now()}@example.test`);

    const clientId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const workerRole = await findRoleByKey(tx, context.organizationId, 'worker');
      if (!workerRole) throw new Error('worker role missing');
      const [membership] = await tx
        .insert(organizationMemberships)
        .values({
          organizationId: context.organizationId,
          userId: worker.id,
          status: 'active',
        })
        .returning({ id: organizationMemberships.id });
      await assignRole(tx, {
        organizationId: context.organizationId,
        membershipId: membership!.id,
        userId: worker.id,
        roleId: workerRole.id,
      });

      const client = await createClient(context, { name: 'Site client' });
      const project = await createProject(context, {
        name: 'Site job',
        clientId: client.id,
      });
      await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '2500',
        issueDate: '2026-08-01',
        finalize: true,
      });
      return client.id;
    });

    await expect(
      database.asUser(worker.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: worker.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return getClientFinancials(context, clientId);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
