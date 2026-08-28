import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { partyIdentifiers } from '@drizzle/schema';
import {
  ScriptedOcrProvider,
  buildFixtureCandidates,
  confirmOcrCandidate,
  createDrizzleOcrRepository,
  extractReceiptJob,
  flushOcrBackgroundJobs,
} from '@/modules/ocr';
import { createExpense, findExpenseById } from '@/modules/expenses';
import { createVendorBillDraftFromOcr } from '@/modules/ocr/application/create-vendor-bill-draft';
import { createVendorCreditDraftFromOcr } from '@/modules/ocr/application/create-vendor-credit-draft';
import {
  findApBillById,
  getVendorCredit,
  setApCreditsPersistenceReadyForTests,
} from '@/modules/ap';
import { createVendor } from '@/modules/vendors';
import {
  insertDocument,
  listDocumentsForEntity,
  updateDocumentById,
} from '@/modules/documents/data/documents.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, createTestOrganization, seedSystem } from '@tests/setup/fixtures';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('OCR extract → confirm draft (PGlite)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    setApCreditsPersistenceReadyForTests(true);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('creates draft expense/bill/credit from a real document row without auto-finalizing', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'ocr-draft@example.test');
    const { organization } = await createTestOrganization(database, owner, 'OCR Draft Co');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Fixture Supplies Ltd' });
      await tx.insert(partyIdentifiers).values({
        organizationId: organization.id,
        vendorId: vendor.id,
        type: 'company_number',
        value: '512345678',
      });

      const documentId = randomUUID();
      await insertDocument(tx, {
        id: documentId,
        organizationId: organization.id,
        storageBucket: 'documents',
        storagePath: `${organization.id}/organization/${organization.id}/${documentId}-receipt.png`,
        originalFilename: 'receipt.png',
        mimeType: 'image/png',
        sizeBytes: 80,
        uploadedByUserId: owner.id,
      });
      await updateDocumentById(tx, organization.id, documentId, { status: 'available' });

      const repo = createDrizzleOcrRepository(tx);
      const provider = new ScriptedOcrProvider(buildFixtureCandidates());
      const extracted = await extractReceiptJob(
        context,
        {
          documentId,
          filename: 'receipt.png',
          mimeType: 'image/png',
          contentBase64: PNG,
          workflow: 'expense',
        },
        provider,
        repo,
      );
      await flushOcrBackgroundJobs();
      const settled = await repo.findJob(context.organizationId, extracted.id);
      expect(settled?.status).toBe('needs_review');
      expect(settled?.confirmedExpenseId).toBeNull();
      expect(settled?.rawMetadata?.vendorMatches?.[0]?.vendorId).toBe(vendor.id);
      expect(settled?.sourceDocument.documentId).toBe(documentId);

      const reused = await extractReceiptJob(
        context,
        { documentId, mimeType: 'image/png', contentBase64: PNG, workflow: 'expense' },
        provider,
        repo,
      );
      expect(reused.id).toBe(extracted.id);
      expect(reused.rawMetadata?.reusedExistingJob).toBe(true);

      const created = await confirmOcrCandidate(
        context,
        {
          jobId: extracted.id,
          confirm: true,
          draftTarget: 'expense',
          acceptedFields: [
            'vendor',
            'gross',
            'currency',
            'date',
            'net',
            'tax',
            'description',
          ],
        },
        { createExpense, repo },
      );
      expect(created.kind).toBe('created');
      if (created.kind !== 'created' || created.draftTarget !== 'expense') {
        throw new Error('expected expense draft');
      }
      const expense = await findExpenseById(tx, organization.id, created.expenseId);
      expect(expense?.status).toBe('draft');
      const links = await listDocumentsForEntity(tx, organization.id, {
        ownerType: 'expense',
        ownerId: created.expenseId,
      });
      expect(links.some((link) => link.id === documentId)).toBe(true);

      const billDocumentId = randomUUID();
      await insertDocument(tx, {
        id: billDocumentId,
        organizationId: organization.id,
        storageBucket: 'documents',
        storagePath: `${organization.id}/organization/${organization.id}/${billDocumentId}-bill.png`,
        originalFilename: 'bill.png',
        mimeType: 'image/png',
        sizeBytes: 80,
        uploadedByUserId: owner.id,
      });
      await updateDocumentById(tx, organization.id, billDocumentId, { status: 'available' });

      const billJob = await extractReceiptJob(
        context,
        {
          documentId: billDocumentId,
          filename: 'bill.png',
          mimeType: 'image/png',
          contentBase64: PNG,
          workflow: 'vendor_bill',
        },
        new ScriptedOcrProvider(buildFixtureCandidates({ reference: 'BILL-UNIQUE' })),
        repo,
      );
      await flushOcrBackgroundJobs();
      const bill = await confirmOcrCandidate(
        context,
        {
          jobId: billJob.id,
          confirm: true,
          draftTarget: 'vendor_bill',
          vendorId: vendor.id,
          acceptedFields: ['vendor', 'gross', 'currency', 'date', 'net', 'tax', 'description'],
        },
        { createVendorBillDraft: createVendorBillDraftFromOcr, repo },
      );
      expect(bill.kind).toBe('created');
      if (bill.kind !== 'created' || bill.draftTarget !== 'vendor_bill') {
        throw new Error('expected vendor bill draft');
      }
      const storedBill = await findApBillById(tx, organization.id, bill.vendorBillId);
      expect(storedBill?.status).toBe('draft');

      const creditJob = await extractReceiptJob(
        context,
        {
          filename: 'credit.png',
          mimeType: 'image/png',
          contentBase64: PNG,
          workflow: 'vendor_credit',
        },
        new ScriptedOcrProvider(
          buildFixtureCandidates({ documentType: 'חשבונית זיכוי', reference: 'CR-1' }),
        ),
        repo,
      );
      await flushOcrBackgroundJobs();
      const credit = await confirmOcrCandidate(
        context,
        {
          jobId: creditJob.id,
          confirm: true,
          draftTarget: 'vendor_credit',
          vendorId: vendor.id,
          acceptedFields: ['vendor', 'gross', 'currency', 'date'],
        },
        { createVendorCreditDraft: createVendorCreditDraftFromOcr, repo },
      );
      expect(credit.kind).toBe('created');
      if (credit.kind !== 'created' || credit.draftTarget !== 'vendor_credit') {
        throw new Error('expected vendor credit draft');
      }
      const storedCredit = await getVendorCredit(context, credit.vendorCreditId);
      expect(storedCredit?.status).toBe('draft');
      expect(credit.job.confirmedDraftTarget).toBe('vendor_credit');
      expect(credit.job.confirmedVendorCreditId).toBe(credit.vendorCreditId);
      expect(credit.job.confirmedExpenseId).toBeNull();
      expect(credit.job.confirmedVendorBillId).toBeNull();
    });
  });

  it('does not expose another organization document or OCR job', async () => {
    await seedSystem(database);
    const ownerA = await createTestUser(database, 'ocr-a@example.test');
    const ownerB = await createTestUser(database, 'ocr-b@example.test');
    const orgA = await createTestOrganization(database, ownerA, 'Org A OCR');
    const orgB = await createTestOrganization(database, ownerB, 'Org B OCR');

    const documentB = await database.asUser(ownerB.id, async (tx) => {
      const documentId = randomUUID();
      await insertDocument(tx, {
        id: documentId,
        organizationId: orgB.organization.id,
        storageBucket: 'documents',
        storagePath: `${orgB.organization.id}/organization/${orgB.organization.id}/${documentId}-x.png`,
        originalFilename: 'x.png',
        mimeType: 'image/png',
        uploadedByUserId: ownerB.id,
      });
      await updateDocumentById(tx, orgB.organization.id, documentId, { status: 'available' });
      return documentId;
    });

    await database.asUser(ownerA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await expect(
        extractReceiptJob(
          context,
          { documentId: documentB, filename: 'x.png', mimeType: 'image/png', contentBase64: PNG },
          new ScriptedOcrProvider(buildFixtureCandidates()),
          createDrizzleOcrRepository(tx),
        ),
      ).rejects.toThrow();
    });
  });
});
