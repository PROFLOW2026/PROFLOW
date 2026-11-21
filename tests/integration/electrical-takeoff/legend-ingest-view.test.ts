import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { resolveOrgContext } from '@/modules/tenancy';
import { authorizeTakeoffProject, externalActorFrom } from '@/modules/electrical-takeoff/application/access';
import { buildAnalysisView } from '@/modules/electrical-takeoff/application/get-analysis-view';
import { getAnalysisViewUseCase } from '@/modules/electrical-takeoff/application/use-cases';
import { applyWorkerResult } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { insertAnalysis, insertFile, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { TAKEOFF_CONTRACT_VERSION, type WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';
import { createContractor, createProjectAs, externalContextFor } from '../../setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';

const LIBREDWG_HOST_PATH =
  'C:\\Users\\ERAN YOSEF\\Desktop\\final projects\\FINAL-WEB\\projectflow\\takeoff-worker\\tools\\bin\\dwg2dxf.exe';

function sheet(fileId: string): WorkerResult['sheets'][number] {
  return {
    sheetKey: 'layout:F0',
    fileId,
    name: 'F0',
    kind: 'dwg_layout',
    index: 0,
    widthPx: 800,
    heightPx: 600,
    previewArtifact: null,
    scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
    analyzed: 'full',
    xrefsMissing: [{ name: '1545-Xref-all-02', path: '.\\1545-Xref-all-02.dwg' }],
    xrefRefs: [{ name: '1545-Xref-all-02', path: 'C:\\org\\secret\\1545-Xref-all-02.dwg', loaded: false }],
    hiddenByLayers: 0,
  };
}

describe('legend ingest and analysis view (isolated PGlite)', () => {
  it('persists legend rows, ids and versions, and sanitizes contractor payloads', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database, 'legend-ingest-owner@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Legend Ingest Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Legend Ingest');
    const viewer = await createContractor(database, {
      organizationId: organization.id,
      projectId,
      label: 'legend-viewer',
      narrowToProject: true,
      capabilities: [EXTERNAL_CAPABILITIES.TAKEOFF_VIEW],
    });

    const { analysisId, oldAnalysisId } = await database.asService(async (db) => {
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'ניתוח מקרא',
        createdByActorType: 'internal',
      });
      const file = await insertFile(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        name: '3643-EL.dwg',
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
        engineVersions: {
          workerBuild: 'test-build-1',
          ezdxf: '1.4.5',
          libredwg: LIBREDWG_HOST_PATH,
        },
        sheets: [sheet(file.id)],
        detections: [
          {
            id: 'layout:F0#1',
            sheetKey: 'layout:F0',
            fileId: file.id,
            source: 'dwg',
            x: 10,
            y: 10,
            w: 8,
            h: 8,
            signature: 'block:36e',
            signatureKind: 'dwg-block',
            rawClass: '36e',
            blockName: '36e',
            typeKey: null,
            classifiedBy: 'none',
            confidence: 'none',
            reasons: ['type_ambiguous', 'legend_unmapped'],
            legendRowIds: ['row:aaaa', 'row:bbbb'],
          },
        ],
        legend: [
          {
            key: 'row:aaaa',
            fileId: file.id,
            sheetKey: 'layout:F0',
            signature: 'block:36e',
            signatureKind: 'dwg-block',
            rawText: 'נקודת מאור חירום',
            decodedText: 'נקודת מאור חירום',
            typeKey: null,
            reasons: ['legend_unmapped'],
          },
          {
            key: 'row:bbbb',
            fileId: file.id,
            sheetKey: 'layout:F0',
            signature: 'block:36e',
            signatureKind: 'dwg-block',
            rawText: 'תאורה שקועה',
            decodedText: 'תאורה שקועה',
            typeKey: null,
            reasons: ['legend_unmapped'],
          },
          {
            key: 'row:cccc',
            fileId: file.id,
            sheetKey: 'layout:F0',
            signature: 'block:12e',
            signatureKind: 'dwg-block',
            rawText: 'נקודה לטלפון חוץ',
            decodedText: 'נקודה לטלפון חוץ',
            typeKey: null,
            reasons: ['legend_unmapped'],
          },
        ],
        linear: [],
        warnings: [],
        errors: [],
        stats: {
          legend_rows_read: 3,
          legend_rows_matched: 2,
          legend_conflicts: 1,
        },
      };
      await applyWorkerResult(db, job.id, result);

      const oldAnalysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'ניתוח ישן',
        createdByActorType: 'internal',
      });
      await insertJob(db, {
        organizationId: organization.id,
        projectId,
        analysisId: oldAnalysis.id,
        status: 'succeeded',
        finishedAt: new Date(),
        resultStats: { detections: 10 },
      });
      return { analysisId: analysis.id, oldAnalysisId: oldAnalysis.id };
    });

    const ownerView = await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: organization.id,
        locale: 'he',
      });
      return getAnalysisViewUseCase(ctx, analysisId);
    });

    expect(ownerView.legend.map((row) => row.key).sort()).toEqual(['row:aaaa', 'row:bbbb', 'row:cccc']);
    expect(ownerView.legend.map((row) => row.decodedText)).toEqual(
      expect.arrayContaining(['נקודת מאור חירום', 'תאורה שקועה', 'נקודה לטלפון חוץ']),
    );
    expect(ownerView.detections[0]?.legendRowIds).toEqual(['row:aaaa', 'row:bbbb']);
    expect(ownerView.detections[0]?.typeKey).toBeNull();
    expect(ownerView.workerStats.legend_rows_read).toBe(3);
    expect(ownerView.workerStats.workerBuild).toBe('test-build-1');
    expect(ownerView.workerStats.engineVersions).toEqual({
      workerBuild: 'test-build-1',
      ezdxf: '1.4.5',
      libredwg: 'dwg2dxf.exe',
    });
    expect(JSON.stringify(ownerView.workerStats)).not.toMatch(/Users|Desktop|takeoff-worker/i);
    expect(ownerView.lastJob?.finishedAtIso).toBeTruthy();

    const oldView = await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: organization.id,
        locale: 'he',
      });
      return getAnalysisViewUseCase(ctx, oldAnalysisId);
    });
    expect(oldView.legend).toEqual([]);
    expect(oldView.detections).toEqual([]);
    expect(oldView.workerStats.workerBuild).toBeUndefined();
    expect(oldView.workerStats.detections).toBe(10);

    await database.asService(async (db) => {
      const ext = await externalContextFor(database, db, viewer, organization.id);
      const actor = externalActorFrom(ext);
      await authorizeTakeoffProject(actor, projectId, 'view');
      await expect(authorizeTakeoffProject(actor, projectId, 'manage')).rejects.toBeInstanceOf(AuthorizationError);

      const contractorView = await buildAnalysisView(actor, analysisId);
      expect(contractorView.legend.map((row) => row.decodedText)).toEqual(
        expect.arrayContaining(['נקודת מאור חירום', 'תאורה שקועה', 'נקודה לטלפון חוץ']),
      );
      expect(contractorView.permissions.canManageLibrary).toBe(false);
      expect(contractorView.sheets[0]?.xrefRefs?.[0]?.path).toBeNull();
      expect(contractorView.sheets[0]?.xrefsMissing?.[0]?.path).toBeNull();
      expect(JSON.stringify(contractorView.workerStats)).not.toMatch(/Users|Desktop|C:\\\\org/i);
      expect((contractorView.workerStats.engineVersions as Record<string, string>).libredwg).toBe('dwg2dxf.exe');

      const noGrant = externalActorFrom({ ...ext, grants: [] });
      await expect(authorizeTakeoffProject(noGrant, projectId, 'view')).rejects.toBeInstanceOf(AuthorizationError);
      await expect(buildAnalysisView(noGrant, analysisId)).rejects.toMatchObject({ takeoffCode: 'not_found' });
    });
  });
});
