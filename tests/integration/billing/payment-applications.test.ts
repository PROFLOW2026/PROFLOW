import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { paymentApplications, payments } from '@drizzle/schema';
import { createBillingAdjustment } from '@/modules/billing/application/create-billing-adjustment';
import { createBillingRecord } from '@/modules/billing/application/create-billing-record';
import { getBillingRecord } from '@/modules/billing/application/get-billing-record';
import { getProjectBillingPosition } from '@/modules/billing/application/get-project-billing-position';
import { recordCustomerPayment } from '@/modules/billing/application/record-customer-payment';
import { recordPayment } from '@/modules/billing/application/record-payment';
import { voidPayment } from '@/modules/billing/application/void-payment';
import { createClient } from '@/modules/clients';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

const ILS = 'ILS';

describe('AR split payment applications', () => {
  let database: TestDatabase;
  let organizationId: string;
  let userId: string;

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
  });

  async function seedClientInvoices(input: {
    readonly clientName?: string;
    readonly amounts: readonly string[];
  }) {
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const client = await createClient(context, { name: input.clientName ?? 'Alpha Ltd' });
      const project = await createProject(context, {
        name: 'Fit-out',
        clientId: client.id,
      });
      const invoices = [];
      for (const [index, amount] of input.amounts.entries()) {
        const billing = await createBillingRecord(context, {
          projectId: project.projectId,
          amount,
          issueDate: `2026-08-0${index + 1}`,
          reference: `INV-${index + 1}`,
          finalize: true,
        });
        invoices.push(billing);
      }
      return { context, client, projectId: project.projectId, invoices };
    });
  }

  it('keeps 1:1 recordPayment compatible via the trigger (no double-apply)', async () => {
    const { invoices } = await seedClientInvoices({ amounts: ['10000'] });
    const invoice = invoices[0]!;

    const recorded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return recordPayment(context, {
        billingRecordId: invoice.id,
        amount: '4000',
        paymentDate: '2026-08-10',
      });
    });

    const apps = await database.asService(async (db) =>
      db
        .select()
        .from(paymentApplications)
        .where(eq(paymentApplications.paymentId, recorded.paymentId)),
    );
    expect(apps).toHaveLength(1);
    expect(apps[0]!.appliedAmount).toBe('4000.000000');
    expect(apps[0]!.billingRecordId).toBe(invoice.id);

    const header = await database.asService(async (db) => {
      const [row] = await db.select().from(payments).where(eq(payments.id, recorded.paymentId));
      return row;
    });
    expect(header?.billingRecordId).toBe(invoice.id);

    const after = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, invoice.id);
    });
    expect(after.paidAmount.amount).toBe('4000.000000');
    expect(after.outstandingAmount.amount).toBe('6000.000000');
  });

  it('allocates a partial amount onto one invoice and leaves remainder unapplied', async () => {
    const { client, invoices } = await seedClientInvoices({ amounts: ['10000'] });
    const invoice = invoices[0]!;

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return recordCustomerPayment(context, {
        clientId: client.id,
        amount: '10000',
        currency: ILS,
        paymentDate: '2026-08-10',
        applications: [{ billingRecordId: invoice.id, amount: '2500' }],
      });
    });

    const after = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, invoice.id);
    });
    expect(after.paidAmount.amount).toBe('2500.000000');
    expect(after.outstandingAmount.amount).toBe('7500.000000');
  });

  it('allocates one payment across multiple invoices of the same client', async () => {
    const { client, invoices } = await seedClientInvoices({ amounts: ['6000', '8000'] });

    const recorded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return recordCustomerPayment(context, {
        clientId: client.id,
        amount: '9000',
        currency: ILS,
        paymentDate: '2026-08-11',
        applications: [
          { billingRecordId: invoices[0]!.id, amount: '5000' },
          { billingRecordId: invoices[1]!.id, amount: '4000' },
        ],
      });
    });

    const header = await database.asService(async (db) => {
      const [row] = await db.select().from(payments).where(eq(payments.id, recorded.paymentId));
      return row;
    });
    expect(header?.billingRecordId).toBeNull();
    expect(header?.clientId).toBe(client.id);

    const first = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, invoices[0]!.id);
    });
    const second = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, invoices[1]!.id);
    });

    expect(first.paidAmount.amount).toBe('5000.000000');
    expect(first.outstandingAmount.amount).toBe('1000.000000');
    expect(second.paidAmount.amount).toBe('4000.000000');
    expect(second.outstandingAmount.amount).toBe('4000.000000');

    const position = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getProjectBillingPosition(context, recorded.billingRecords[0]!.projectId!);
    });
    expect(position.paid.amount).toBe('9000.000000');
    expect(position.outstanding.amount).toBe('5000.000000');
  });

  it('blocks over-application against outstanding', async () => {
    const { client, invoices } = await seedClientInvoices({ amounts: ['1000'] });

    await expect(
      database.asUser(userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId,
          organizationId,
          locale: 'en',
        });
        return recordCustomerPayment(context, {
          clientId: client.id,
          amount: '2000',
          currency: ILS,
          paymentDate: '2026-08-12',
          applications: [{ billingRecordId: invoices[0]!.id, amount: '1500' }],
        });
      }),
    ).rejects.toMatchObject({ messageKey: 'billing.errors.paymentOverApplied' });
  });

  it('voids a split payment: outstanding reverses, applications remain as history', async () => {
    const { client, invoices } = await seedClientInvoices({ amounts: ['5000', '5000'] });

    const recorded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return recordCustomerPayment(context, {
        clientId: client.id,
        amount: '8000',
        currency: ILS,
        paymentDate: '2026-08-13',
        applications: [
          { billingRecordId: invoices[0]!.id, amount: '5000' },
          { billingRecordId: invoices[1]!.id, amount: '3000' },
        ],
      });
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return voidPayment(context, recorded.paymentId);
    });

    const apps = await database.asService(async (db) =>
      db
        .select()
        .from(paymentApplications)
        .where(eq(paymentApplications.paymentId, recorded.paymentId)),
    );
    expect(apps).toHaveLength(2);

    const first = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, invoices[0]!.id);
    });
    expect(first.paidAmount.amount).toBe('0.000000');
    expect(first.outstandingAmount.amount).toBe('5000.000000');
    expect(first.payments.some((payment) => payment.status === 'void')).toBe(true);
  });

  it('does not apply payments onto credit notes', async () => {
    const { invoices } = await seedClientInvoices({ amounts: ['10000'] });

    const creditNote = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return createBillingAdjustment(context, {
        billingRecordId: invoices[0]!.id,
        amount: '2000',
        issueDate: '2026-08-14',
      });
    });

    await expect(
      database.asUser(userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId,
          organizationId,
          locale: 'en',
        });
        return recordPayment(context, {
          billingRecordId: creditNote.id,
          amount: '500',
          paymentDate: '2026-08-15',
        });
      }),
    ).rejects.toMatchObject({ messageKey: 'billing.errors.paymentTargetCreditNote' });

    await expect(
      database.asUser(userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId,
          organizationId,
          locale: 'en',
        });
        return recordCustomerPayment(context, {
          clientId: creditNote.clientId ?? invoices[0]!.clientId!,
          amount: '500',
          currency: ILS,
          paymentDate: '2026-08-15',
          applications: [{ billingRecordId: creditNote.id, amount: '500' }],
        });
      }),
    ).rejects.toMatchObject({ messageKey: 'billing.errors.paymentTargetCreditNote' });
  });

  it('void of a 1:1 payment still reverses outstanding', async () => {
    const { invoices } = await seedClientInvoices({ amounts: ['3000'] });

    const recorded = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return recordPayment(context, {
        billingRecordId: invoices[0]!.id,
        amount: '3000',
        paymentDate: '2026-08-16',
      });
    });

    await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return voidPayment(context, recorded.paymentId);
    });

    const after = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      return getBillingRecord(context, invoices[0]!.id);
    });
    expect(after.paidAmount.amount).toBe('0.000000');
    expect(after.outstandingAmount.amount).toBe('3000.000000');
  });
});
