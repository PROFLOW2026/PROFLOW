import { describe, expect, it } from 'vitest';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedSystem, createTestOrganization, createTestUser } from '../../setup/fixtures';
import { createProjectAs } from '../../setup/dg-fixtures';
import { applyWorkerResult } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { WORKER_INGEST_ERROR_MESSAGE, WorkerIngestError } from '@/modules/electrical-takeoff/domain/worker-ingest-error';
import { findJob, insertAnalysis, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { takeoffDetections, takeoffSheets } from '@drizzle/schema';
import { eq } from 'drizzle-orm';

describe('worker result ingest failure', () => {
  it('marks job failed with safe error and no partial rows', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const user = await createTestUser(database);
    const { organization } = await createTestOrganization(database, user, 'Ingest Fail Org');
    const projectId = await createProjectAs(database, user.id, organization.id, 'P-fail');

    await database.asService(async (db) => {
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'X',
        createdByActorType: 'internal',
      });
      const job = await insertJob(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        status: 'running',
        percent: 100,
        stage: 'done',
      });

      const badPayload = { contractVersion: 2, jobId: job.id, status: 'succeeded', sheets: 'not-an-array' };

      await expect(applyWorkerResult(db, job.id, badPayload)).rejects.toBeInstanceOf(WorkerIngestError);

      const row = await findJob(db, organization.id, job.id);
      expect(row?.status).toBe('failed');
      expect(row?.error).toBe(WORKER_INGEST_ERROR_MESSAGE);
      expect(row?.resultIngestedAt).toBeNull();

      const sheets = await db.select().from(takeoffSheets).where(eq(takeoffSheets.jobId, job.id));
      const detections = await db.select().from(takeoffDetections).where(eq(takeoffDetections.jobId, job.id));
      expect(sheets.length).toBe(0);
      expect(detections.length).toBe(0);

      await expect(applyWorkerResult(db, job.id, badPayload)).rejects.toBeInstanceOf(WorkerIngestError);
      const retry = await findJob(db, organization.id, job.id);
      expect(retry?.status).toBe('failed');
    });
  });
});