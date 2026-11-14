import { describe, it } from 'vitest';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedSystem, createTestOrganization, createTestUser } from '../../setup/fixtures';
import { createProjectAs } from '../../setup/dg-fixtures';
import { parseWorkerResultPayload } from '@/modules/electrical-takeoff/domain/worker-json';
import { ingestWorkerResult, insertAnalysis, insertFile, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { TAKEOFF_CONTRACT_VERSION } from '@/modules/electrical-takeoff/domain/contracts';

describe('ingestWorkerResult multi-file sheet keys', () => {
  it('accepts two pdf_page sheets with the same sheetKey on different files', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const user = await createTestUser(database);
    const { organization } = await createTestOrganization(database, user, 'Sheet UQ Org');
    const projectId = await createProjectAs(database, user.id, organization.id, 'P1');

    await database.asService(async (db) => {
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'X',
        createdByActorType: 'internal',
      });
      const legend = await insertFile(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        name: 'legend.pdf',
        kind: 'pdf',
        sizeBytes: 1,
        uploadState: 'complete',
      });
      const plan = await insertFile(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        name: 'plan.pdf',
        kind: 'pdf',
        sizeBytes: 1,
        uploadState: 'complete',
      });
      const job = await insertJob(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        status: 'running',
      });
      const body = {
        contractVersion: TAKEOFF_CONTRACT_VERSION,
        jobId: job.id,
        status: 'succeeded',
        startedAtIso: new Date().toISOString(),
        finishedAtIso: new Date().toISOString(),
        sheets: [
          {
            sheetKey: 'p1',
            fileId: legend.id,
            name: 'legend p1',
            kind: 'pdf_page',
            index: 0,
            widthPx: 100,
            heightPx: 100,
            previewArtifact: null,
            scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
            analyzed: 'full',
            xrefsMissing: [],
            hiddenByLayers: 0,
          },
          {
            sheetKey: 'p1',
            fileId: plan.id,
            name: 'plan p1',
            kind: 'pdf_page',
            index: 0,
            widthPx: 100,
            heightPx: 100,
            previewArtifact: null,
            scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
            analyzed: 'full',
            xrefsMissing: [],
            hiddenByLayers: 0,
          },
        ],
        detections: [],
        legend: [],
        linear: [],
        warnings: [],
        errors: [],
        stats: {},
        engineVersions: {},
      };
      const result = parseWorkerResultPayload(body);
      await ingestWorkerResult(db, organization.id, projectId, analysis.id, job.id, result);
    });
  });
});