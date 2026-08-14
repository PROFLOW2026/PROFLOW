import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApBill } from '@/modules/ap';
import { createBillingRecord } from '@/modules/billing';
import { createPurchaseOrder } from '@/modules/procurement';
import { createProject } from '@/modules/projects';
import { createQuote } from '@/modules/quotes';
import {
  acceptInvitation,
  allocateDocumentNumber,
  createInvitation,
  createOrganization,
  listDocumentNumberSettings,
  resolveOrgContext,
  saveDocumentNumberSettings,
} from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { AuthorizationError } from '@/shared/errors';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

describe('internal document numbering', () => {
  let database: TestDatabase;
  let organizationId: string;
  let ownerId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    const owner = await createTestUser(database, 'numbering-owner@example.test');
    const created = await database.asUser(owner.id, async (tx) =>
      createOrganization(tx, owner.id, {
        name: 'Numbering Org',
        countryCode: 'IL',
      }),
    );
    organizationId = created.organization.id;
    ownerId = owner.id;
  });

  it('allocates sequential numbers and keeps a user-supplied reference', async () => {
    await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });

      await saveDocumentNumberSettings(context, {
        sequences: [
          { documentKind: 'purchase_order', prefix: 'PO-', padding: 4, nextNumber: 1 },
          { documentKind: 'vendor_bill', prefix: 'VB-', padding: 3, nextNumber: 7 },
          { documentKind: 'billing_record', prefix: 'BR-', padding: 4, nextNumber: 1 },
          { documentKind: 'estimate', prefix: 'EST-', padding: 4, nextNumber: 1 },
        ],
      });

      const vendor = await createVendor(context, { name: 'Numbering Vendor' });
      const first = await createPurchaseOrder(context, {
        vendorId: vendor.id,
        currency: 'ILS',
        committedAmount: '100',
        lines: [
          {
            description: 'Cable',
            quantity: '1',
            unitAmount: '100',
            lineTotal: '100',
            currency: 'ILS',
          },
        ],
      });
      const second = await createPurchaseOrder(context, {
        vendorId: vendor.id,
        currency: 'ILS',
        committedAmount: '50',
        lines: [
          {
            description: 'Tape',
            quantity: '1',
            unitAmount: '50',
            lineTotal: '50',
            currency: 'ILS',
          },
        ],
      });
      const custom = await createPurchaseOrder(context, {
        vendorId: vendor.id,
        reference: 'VENDOR-PO-9',
        currency: 'ILS',
        committedAmount: '10',
        lines: [
          {
            description: 'Clips',
            quantity: '1',
            unitAmount: '10',
            lineTotal: '10',
            currency: 'ILS',
          },
        ],
      });

      expect(first.reference).toBe('PO-0001');
      expect(second.reference).toBe('PO-0002');
      expect(custom.reference).toBe('VENDOR-PO-9');
      expect(await allocateDocumentNumber(context, 'purchase_order')).toBe('PO-0003');

      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency: 'ILS',
        totalAmount: '80',
        billDate: '2026-08-01',
        lines: [
          {
            description: 'Materials',
            quantity: '1',
            unitAmount: '80',
            lineTotal: '80',
            currency: 'ILS',
          },
        ],
      });
      expect(bill.reference).toBe('VB-007');

      const vendorRefBill = await createApBill(context, {
        vendorId: vendor.id,
        reference: 'INV-88',
        currency: 'ILS',
        totalAmount: '20',
        billDate: '2026-08-01',
        lines: [
          {
            description: 'Sundries',
            quantity: '1',
            unitAmount: '20',
            lineTotal: '20',
            currency: 'ILS',
          },
        ],
      });
      expect(vendorRefBill.reference).toBe('INV-88');

      const project = await createProject(context, { name: 'Numbered job' });
      const billing = await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '200',
        issueDate: '2026-08-01',
      });
      expect(billing.reference).toBe('BR-0001');

      const quote = await createQuote(context, {
        title: 'Kitchen remodel',
        lines: [{ description: 'Cabinets', quantity: '1', unitPriceAmount: '1000' }],
      });
      expect(quote.title.startsWith('EST-0001')).toBe(true);

      const named = await createQuote(context, {
        title: 'Bathroom',
        reference: 'Q-99',
        lines: [{ description: 'Tiles', quantity: '1', unitPriceAmount: '400' }],
      });
      expect(named.title.startsWith('Q-99')).toBe(true);
    });
  });

  it('lets org.read view sequences and blocks org.update for workers', async () => {
    const invitation = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return createInvitation(context, { email: 'numbering-worker@example.test', roleKey: 'worker' });
    });
    const worker = await createTestUser(database, 'numbering-worker@example.test');
    await database.asService((db) =>
      acceptInvitation(db, {
        token: invitation.token,
        userId: worker.id,
        userEmail: worker.email,
      }),
    );

    await database.asUser(worker.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: worker.id,
        organizationId,
        locale: 'en',
      });
      const listed = await listDocumentNumberSettings(context);
      expect(listed).toHaveLength(6);
      await expect(
        saveDocumentNumberSettings(context, {
          sequences: [{ documentKind: 'estimate', prefix: 'X', padding: 4, nextNumber: 1 }],
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it('blocks next_document_number against another organization UUID', async () => {
    const otherOwner = await createTestUser(database, 'numbering-other@example.test');
    const orgB = await database.asUser(otherOwner.id, async (tx) =>
      createOrganization(tx, otherOwner.id, {
        name: 'Other Numbering Org',
        countryCode: 'IL',
      }),
    );

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO document_number_sequences (organization_id, document_kind, prefix, padding, next_number)
        VALUES (${orgB.organization.id}::uuid, 'estimate', 'EST-', 4, 9)
      `);
    });

    await database.asUser(ownerId, async (tx) => {
      await expect(
        tx.execute(sql`SELECT app.next_document_number(${orgB.organization.id}::uuid, 'estimate')`),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(/not org member|insufficient_privilege/i),
        }),
      });
    });

    const after = await database.asService(async (db) =>
      resultRows<{ next_number: number }>(
        await db.execute(sql`
          SELECT next_number FROM document_number_sequences
          WHERE organization_id = ${orgB.organization.id}::uuid AND document_kind = 'estimate'
        `),
      ),
    );
    expect(after[0]?.next_number).toBe(9);
  });
});
