import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildFixtureCandidates,
  createDrizzleOcrRepository,
} from '@/modules/ocr';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, createTestOrganization, seedSystem } from '@tests/setup/fixtures';

/**
 * Scenario L - OCR job metadata survives a new repository instance (restart double).
 * Uses disposable PGlite; does not flip production OCR_PERSISTENCE_READY.
 */
describe('scenario L - OCR persistence restart', () => {
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

  it('extraction job review state remains after recreating the Drizzle repository', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'ocr-restart@example.test');
    const { organization } = await createTestOrganization(database, owner, 'OCR Restart Co');

    const jobId = await database.asService(async (db) => {
      const repo1 = createDrizzleOcrRepository(db);
      const queued = await repo1.createQueuedJob({
        organizationId: organization.id,
        filename: 'receipt.pdf',
        mimeType: 'application/pdf',
        providerId: 'fixture',
      });
      const reviewed = await repo1.updateJob(organization.id, queued.id, {
        status: 'needs_review',
        reviewStatus: 'awaiting_review',
        candidates: buildFixtureCandidates(),
        extractedCandidates: buildFixtureCandidates(),
        overallConfidence: 0.91,
        rawMetadata: {
          providerId: 'fixture',
          overallConfidence: 0.91,
          extractedAt: new Date().toISOString(),
        },
      });
      expect(reviewed?.status).toBe('needs_review');
      return queued.id;
    });

    await database.asService(async (db) => {
      const repo2 = createDrizzleOcrRepository(db);
      const found = await repo2.findJob(organization.id, jobId);
      expect(found).not.toBeNull();
      expect(found!.status).toBe('needs_review');
      expect(found!.extractedCandidates?.vendor.value).toBe('Fixture Supplies Ltd');
      expect(found!.overallConfidence).toBeCloseTo(0.91);
      expect(found!.confirmedExpenseId).toBeNull();
      expect(found!.confirmedVendorBillId).toBeNull();
      expect(found!.confirmedDraftTarget).toBeNull();

      const listed = await repo2.listJobsForOrg(organization.id, {
        status: 'needs_review',
      });
      expect(listed.some((j) => j.id === jobId)).toBe(true);

      await expect(
        repo2.updateJob(organization.id, jobId, {
          confirmedDraftTarget: 'expense',
          confirmedExpenseId: '018f0000-0000-7000-8000-0000000000e1',
          confirmedVendorBillId: '018f0000-0000-7000-8000-0000000000b1',
        }),
      ).rejects.toThrow();
    });
  });
});
