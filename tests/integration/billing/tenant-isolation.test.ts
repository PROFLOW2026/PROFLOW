import { describe, expect, it, afterAll, beforeAll, beforeEach } from 'vitest';
import { createBillingRecord } from '@/modules/billing/application/create-billing-record';
import { getBillingRecord } from '@/modules/billing/application/get-billing-record';
import { getProjectBillingPosition } from '@/modules/billing/application/get-project-billing-position';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from './setup';

describe('billing tenant isolation', () => {
  let database: TestDatabase;
  let projectId: string;
  let billingRecordId: string;
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;
    userAId = userA.id;
    userBId = userB.id;

    const created = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const project = await createProject(context, { name: 'Tower Renovation' });
      const billing = await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '15000',
        issueDate: '2026-08-01',
        finalize: true,
      });
      return { projectId: project.projectId, billingRecordId: billing.id };
    });

    projectId = created.projectId;
    billingRecordId = created.billingRecordId;
  });

  it('allows the owning tenant to read billing data', async () => {
    const record = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      return getBillingRecord(context, billingRecordId);
    });

    expect(record.totalAmount.amount).toBe('15000.000000');
  });

  it('prevents another tenant from reading a billing record', async () => {
    await expect(
      database.asUser(userBId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userBId,
          organizationId: orgBId,
          locale: 'en',
        });
        return getBillingRecord(context, billingRecordId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prevents another tenant from reading project billing position', async () => {
    await expect(
      database.asUser(userBId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userBId,
          organizationId: orgBId,
          locale: 'en',
        });
        return getProjectBillingPosition(context, projectId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prevents creating billing in another tenant project', async () => {
    await expect(
      database.asUser(userBId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userBId,
          organizationId: orgBId,
          locale: 'en',
        });
        return createBillingRecord(context, {
          projectId,
          amount: '100',
          issueDate: '2026-08-02',
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects cross-tenant org context outright', async () => {
    await expect(
      database.asUser(userBId, async (tx) =>
        resolveOrgContext(tx, {
          userId: userBId,
          organizationId: orgAId,
          locale: 'en',
        }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
