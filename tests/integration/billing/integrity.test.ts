import { describe, expect, it, afterAll, beforeAll, beforeEach } from 'vitest';
import { createBillingRecord } from '@/modules/billing/application/create-billing-record';
import { createBillingAdjustment } from '@/modules/billing/application/create-billing-adjustment';
import { getBillingRecord } from '@/modules/billing/application/get-billing-record';
import { getProjectBillingPosition } from '@/modules/billing/application/get-project-billing-position';
import { recordPayment } from '@/modules/billing/application/record-payment';
import { getProjectFinancials } from '@/modules/financials';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

describe('billing integrity', () => {
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
      const project = await createProject(context, { name: 'Office fit-out' });
      return project.projectId;
    });
  });

  it('rejects billing records in a currency that differs from the project', async () => {
    await expect(
      database.asUser(userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId,
          organizationId,
          locale: 'en',
        });
        return createBillingRecord(context, {
          projectId,
          amount: '1000',
          currency: 'USD',
          issueDate: '2026-08-01',
        });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('adjusts invoiced totals via credit note without voiding the original', async () => {
    const billingRecordId = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const billing = await createBillingRecord(context, {
        projectId,
        amount: '10000',
        issueDate: '2026-08-01',
        finalize: true,
      });
      await recordPayment(context, {
        billingRecordId: billing.id,
        amount: '3000',
        paymentDate: '2026-08-05',
      });
      await createBillingAdjustment(context, {
        billingRecordId: billing.id,
        amount: '10000',
        issueDate: '2026-08-06',
      });
      return billing.id;
    });

    const position = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getProjectBillingPosition(context, projectId);
    });

    expect(position.invoiced.amount).toBe('0.000000');
    expect(position.paid.amount).toBe('3000.000000');
    expect(position.outstanding.amount).toBe('-3000.000000');

    const original = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, billingRecordId);
    });

    expect(original.status).toBe('finalized');
  });

  it('degrades foreign-currency billing rows on the financial read path', async () => {
    await database.asService(async (db) => {
      const { billingRecords } = await import('@drizzle/schema');
      await db.insert(billingRecords).values({
        organizationId,
        projectId,
        kind: 'invoice',
        status: 'finalized',
        issueDate: '2026-08-01',
        subtotalAmount: '1000.000000',
        totalAmount: '1000.000000',
        currency: 'USD',
        finalizedAt: new Date(),
      });
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const billing = await createBillingRecord(context, {
        projectId,
        amount: '5000',
        issueDate: '2026-08-02',
        finalize: true,
      });
      expect(billing.totalAmount.currency).toBe('ILS');
    });

    const financials = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getProjectFinancials(context, projectId);
    });

    expect(financials.billing.invoiced.amount).toBe('5000.000000');
  });
});
