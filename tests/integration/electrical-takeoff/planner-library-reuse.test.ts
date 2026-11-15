import { describe, expect, it } from 'vitest';

import { applyEditsUseCase, getAnalysisViewUseCase, listLibraryUseCase } from '@/modules/electrical-takeoff/application/use-cases';
import { symbolLibraryForWorker } from '@/modules/electrical-takeoff/application/symbol-library-request';
import { applyWorkerResult } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { insertAnalysis, insertFile, insertJob, listLibrary } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { TAKEOFF_CONTRACT_VERSION, type WorkerDetection, type WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProjectAs } from '../../setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';

const PLANNER = 'office-3096';

function mark(fileId: string): WorkerDetection {
  return {
    id: 'layout:BEZEQ#1',
    sheetKey: 'layout:BEZEQ',
    fileId,
    source: 'dwg',
    x: 10,
    y: 10,
    w: 12,
    h: 12,
    signature: 'block:l39',
    signatureKind: 'dwg-block',
    rawClass: 'l39',
    blockName: 'L39',
    typeKey: null,
    classifiedBy: 'none',
    confidence: 'none',
    reasons: ['unclassified'],
  };
}

describe('planner library is reused by the next analysis', () => {
  it('saves a block assignment from the first analysis and loads it for the same office', async () => {
    process.env.TAKEOFF_FORCE_PERSISTENT = '1';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database, 'takeoff-library@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Takeoff Library Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Library');

    const analysisA = await database.asService(async (db) => {
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'ניתוח ראשון',
        plannerKey: PLANNER,
        createdByActorType: 'internal',
      });
      const file = await insertFile(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        name: '3096-EL.dwg',
        kind: 'dwg',
        sizeBytes: 1,
        uploadState: 'complete',
      });
      const job = await insertJob(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        status: 'running',
      });
      const result: WorkerResult = {
        contractVersion: TAKEOFF_CONTRACT_VERSION,
        jobId: job.id,
        status: 'succeeded',
        startedAtIso: new Date().toISOString(),
        finishedAtIso: new Date().toISOString(),
        sheets: [
          {
            sheetKey: 'layout:BEZEQ',
            fileId: file.id,
            name: 'BEZEQ',
            kind: 'dwg_layout',
            index: 0,
            widthPx: 800,
            heightPx: 600,
            previewArtifact: null,
            scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
            analyzed: 'full',
            xrefsMissing: [],
            hiddenByLayers: 0,
          },
        ],
        detections: [mark(file.id)],
        legend: [],
        linear: [],
        warnings: [],
        errors: [],
        stats: {},
        engineVersions: {},
      };
      await applyWorkerResult(db, job.id, result);
      return analysis.id;
    });

    await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const view = await getAnalysisViewUseCase(ctx, analysisA);
      await applyEditsUseCase(
        ctx,
        analysisA,
        [{ op: 'reclassify', detectionId: 'layout:BEZEQ#1', typeKey: 'power.socket.single', saveToLibrary: true }],
        view.summary.revision,
      );
    });

    const loaded = await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const sameOffice = await listLibraryUseCase(ctx, PLANNER);
      const otherOffice = await listLibraryUseCase(ctx, 'other-office');
      const forWorker = symbolLibraryForWorker(await listLibrary(tx, organization.id, PLANNER));
      return { sameOffice, otherOffice, forWorker };
    });

    expect(loaded.sameOffice).toEqual([
      expect.objectContaining({
        plannerKey: PLANNER,
        signatureKind: 'dwg-block',
        signature: 'block:l39',
        typeKey: 'power.socket.single',
      }),
    ]);
    expect(loaded.otherOffice).toEqual([]);
    expect(loaded.forWorker).toEqual([
      expect.objectContaining({
        plannerKey: PLANNER,
        signatureKind: 'dwg-block',
        signature: 'block:l39',
        typeKey: 'power.socket.single',
      }),
    ]);
  });
});
