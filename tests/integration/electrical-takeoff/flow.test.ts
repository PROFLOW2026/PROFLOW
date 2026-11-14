import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolveTakeoffCorpusFiles } from '../../helpers/takeoff-corpus';
import { startTakeoffCallbackServer } from '../../helpers/takeoff-callback-server';
import type { DbExecutor } from '@/shared/db/types';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedSystem, createTestOrganization, createTestUser } from '../../setup/fixtures';
import { createProjectAs } from '../../setup/dg-fixtures';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  applyEditsUseCase,
  approveAnalysisUseCase,
  beginFileUploadUseCase,
  createAnalysisUseCase,
  getAnalysisViewUseCase,
  reopenAnalysisUseCase,
  startAnalysisUseCase,
} from '@/modules/electrical-takeoff/application/use-cases';
import { handleTakeoffChunk, resetChunkBuffersForTests } from '@/modules/electrical-takeoff/application/chunk-upload';
import { setFakeWorkerDbForTests, setTakeoffFileStoreForTests, createInMemoryTakeoffFileStore } from '@/modules/electrical-takeoff/server';
import { applyWorkerProgress, applyWorkerResult } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { TAKEOFF_CONTRACT_VERSION, type WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';
import { findJob, insertAnalysis, insertFile, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';

describe('electrical takeoff integration', () => {
  it('runs fake worker lifecycle on PGlite', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    process.env.TAKEOFF_USE_FAKE_WORKER = '1';
    process.env.TAKEOFF_FILE_STORE = 'memory';
    process.env.TAKEOFF_FORCE_PERSISTENT = '1';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    resetChunkBuffersForTests();
    const store = createInMemoryTakeoffFileStore();
    setTakeoffFileStoreForTests(store);

    const owner = await createTestUser(database, 'takeoff-owner@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Takeoff Org');
    const orgId = organization.id;
    const projectId = await createProjectAs(database, owner.id, orgId, 'Takeoff Tower');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, { userId: owner.id, organizationId: orgId, locale: 'he' });
      const analysis = await createAnalysisUseCase(context, projectId, { name: 'חשמל קומה 1' });
      const planBytes = new TextEncoder().encode('%PDF-1.4');
      const upload = await beginFileUploadUseCase(context, analysis.id, { name: 'plan.pdf', sizeBytes: planBytes.length, kind: 'pdf' });
      await handleTakeoffChunk({
        db: context.db,
        store,
        organizationId: orgId,
        projectId,
        fileId: upload.fileId,
        kind: 'pdf',
        offset: 0,
        totalBytes: planBytes.length,
        sessionRaw: null,
        bytes: planBytes,
      });

      delete process.env.TAKEOFF_AI_BASE_URL;
      const { jobId } = await startAnalysisUseCase(context, analysis.id, { fileIds: [upload.fileId], useAi: true });
      const job = await findJob(context.db, orgId, jobId);
      expect(job?.workerJobId).toBeTruthy();
      expect(job?.status).toBe('succeeded');

      const view0 = await getAnalysisViewUseCase(context, analysis.id);
      expect(view0.detections.length).toBeGreaterThan(0);
      const codes = view0.workerWarnings.map((w) => w.code);
      expect(codes).toContain('ai_unavailable');
      expect(codes).toContain('xref_missing');
      expect(codes).toContain('sheet_partial');
      expect(view0.workerStats.detection_count).toBeGreaterThan(0);

      const edited = await applyEditsUseCase(context, analysis.id, [{ op: 'confirm', detectionIds: [view0.detections[0]!.id] }], view0.summary.revision);
      expect(edited.summary.revision).toBeGreaterThan(analysis.revision);

      const approved = await approveAnalysisUseCase(context, analysis.id, edited.summary.revision);
      expect(approved.summary.status).toBe('approved');

      const reopened = await reopenAnalysisUseCase(context, analysis.id, approved.summary.revision);
      expect(reopened.summary.status).toBe('in_review');
    });
  });

  it('auto-derives PDF↔DWG pairing into job requestJson and worker dispatch', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    process.env.TAKEOFF_USE_FAKE_WORKER = '1';
    process.env.TAKEOFF_FILE_STORE = 'memory';
    process.env.TAKEOFF_FORCE_PERSISTENT = '1';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    resetChunkBuffersForTests();
    const store = createInMemoryTakeoffFileStore();
    setTakeoffFileStoreForTests(store);
    await database.asService(async (db) => setFakeWorkerDbForTests(db));

    const owner = await createTestUser(database, 'pairing-owner@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Pairing Org');
    const orgId = organization.id;
    const projectId = await createProjectAs(database, owner.id, orgId, 'Pairing Tower');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, { userId: owner.id, organizationId: orgId, locale: 'he' });
      const analysis = await createAnalysisUseCase(context, projectId, { name: '7155 pairing' });
      const legendBytes = new TextEncoder().encode('%PDF-1.4');
      const planBytes = new TextEncoder().encode('%PDF-1.4-plan');
      const dwgBytes = new TextEncoder().encode('AC1021');

      const legend = await beginFileUploadUseCase(context, analysis.id, {
        name: '7155-A1-מקרא.pdf',
        sizeBytes: legendBytes.length,
        kind: 'pdf',
      });
      const plan = await beginFileUploadUseCase(context, analysis.id, {
        name: '7155-A1-תאורה ג.pdf',
        sizeBytes: planBytes.length,
        kind: 'pdf',
      });
      const dwg = await beginFileUploadUseCase(context, analysis.id, {
        name: '7155-A1.dwg',
        sizeBytes: dwgBytes.length,
        kind: 'dwg',
      });

      for (const [fileId, bytes, kind] of [
        [legend.fileId, legendBytes, 'pdf'] as const,
        [plan.fileId, planBytes, 'pdf'] as const,
        [dwg.fileId, dwgBytes, 'dwg'] as const,
      ]) {
        await handleTakeoffChunk({
          db: context.db,
          store,
          organizationId: orgId,
          projectId,
          fileId,
          kind,
          offset: 0,
          totalBytes: bytes.length,
          sessionRaw: fileId,
          bytes,
        });
      }

      const explicit = [{ pdfFileId: plan.fileId, dwgFileId: dwg.fileId }];
      const { jobId } = await startAnalysisUseCase(context, analysis.id, {
        fileIds: [legend.fileId, plan.fileId, dwg.fileId],
        pairing: explicit,
      });
      const job = await findJob(context.db, orgId, jobId);
      const req = job?.requestJson as {
        pairing?: { pdfFileId: string; dwgFileId: string }[];
        sheetSelection?: { fileId: string; sheetKey: string }[];
      };
      expect(req?.pairing).toEqual([{ pdfFileId: plan.fileId, dwgFileId: dwg.fileId }]);
      expect(req?.pairing).toHaveLength(1);
    });

    setFakeWorkerDbForTests(null);
  });

  it('ingests progress + result idempotently', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const user = await createTestUser(database);
    const { organization } = await createTestOrganization(database, user, 'Takeoff Idempotent Org');
    const projectId = await createProjectAs(database, user.id, organization.id, 'P1');

    await database.asService(async (db) => {
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'X',
        createdByActorType: 'internal',
      });
      const file = await insertFile(db, {
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        name: 'a.pdf',
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
      await applyWorkerProgress(db, job.id, { jobId: job.id, stage: 'extract', percent: 40, message: 'ok' });
      const result: WorkerResult = {
        contractVersion: TAKEOFF_CONTRACT_VERSION,
        jobId: job.id,
        status: 'succeeded',
        startedAtIso: new Date().toISOString(),
        finishedAtIso: new Date().toISOString(),
        sheets: [],
        detections: [
          {
            id: 'p1#1',
            sheetKey: 'p1',
            fileId: file.id,
            source: 'pdf',
            x: 1,
            y: 2,
            w: 1,
            h: 1,
            signature: 's',
            signatureKind: 'pdf-shape',
            rawClass: 'L1',
            typeKey: null,
            classifiedBy: 'none',
            confidence: 'none',
            reasons: [],
          },
        ],
        legend: [],
        linear: [],
        warnings: [],
        errors: [],
        stats: {},
        engineVersions: {},
      };
      const first = await applyWorkerResult(db, job.id, result);
      const second = await applyWorkerResult(db, job.id, result);
      expect(first.alreadyIngested).toBe(false);
      expect(second.alreadyIngested).toBe(true);
    });
  });

  const workerUrl = process.env.TAKEOFF_E2E_WORKER_URL?.trim() || process.env.TAKEOFF_WORKER_URL?.trim();
  const corpus = resolveTakeoffCorpusFiles();
  it.skipIf(!workerUrl || !corpus)('optional real worker + 7155 corpus (timed)', async (ctx) => {
    const healthUrl = `${workerUrl!.replace(/\/?$/, '/')}/healthz`;
    let workerUp = false;
    try {
      workerUp = (await fetch(healthUrl)).ok;
    } catch {
      workerUp = false;
    }
    if (!workerUp) ctx.skip(`worker not reachable at ${healthUrl}`);
    process.env.TAKEOFF_WORKER_SECRET = process.env.TAKEOFF_WORKER_SECRET ?? 'integration-test-secret-32chars!!';
    process.env.TAKEOFF_USE_FAKE_WORKER = '0';
    process.env.TAKEOFF_FILE_STORE = 'memory';
    process.env.TAKEOFF_FORCE_PERSISTENT = '1';
    process.env.TAKEOFF_WORKER_URL = workerUrl;
    const t0 = Date.now();
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    resetChunkBuffersForTests();
    const store = createInMemoryTakeoffFileStore();
    setTakeoffFileStoreForTests(store);

    let adminDb: DbExecutor | null = null;
    await database.asService(async (db) => {
      adminDb = db;
      setFakeWorkerDbForTests(db);
    });

    const stub = await startTakeoffCallbackServer(adminDb!, 0);
    process.env.NEXT_PUBLIC_APP_URL = `http://127.0.0.1:${stub.port}`;

    const owner = await createTestUser(database, 'takeoff-7155@example.test');
    const { organization } = await createTestOrganization(database, owner, '7155 Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, '7155');
    const pdfBytes = new Uint8Array(await readFile(corpus!.pdfLighting));
    const dwgBytes = new Uint8Array(await readFile(corpus!.dwg));

    let jobId = '';
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const analysis = await createAnalysisUseCase(context, projectId, { name: '7155 ג' });
      const pdf = await beginFileUploadUseCase(context, analysis.id, {
        name: '7155-A1-תאורה ג.pdf',
        sizeBytes: pdfBytes.length,
        kind: 'pdf',
      });
      const dwg = await beginFileUploadUseCase(context, analysis.id, {
        name: '7155-A1.dwg',
        sizeBytes: dwgBytes.length,
        kind: 'dwg',
      });
      await handleTakeoffChunk({
        db: context.db,
        store,
        organizationId: organization.id,
        projectId,
        fileId: pdf.fileId,
        kind: 'pdf',
        offset: 0,
        totalBytes: pdfBytes.length,
        sessionRaw: pdf.fileId,
        bytes: pdfBytes,
      });
      await handleTakeoffChunk({
        db: context.db,
        store,
        organizationId: organization.id,
        projectId,
        fileId: dwg.fileId,
        kind: 'dwg',
        offset: 0,
        totalBytes: dwgBytes.length,
        sessionRaw: dwg.fileId,
        bytes: dwgBytes,
      });
      ({ jobId } = await startAnalysisUseCase(context, analysis.id, {
        fileIds: [pdf.fileId, dwg.fileId],
        pairing: [{ pdfFileId: pdf.fileId, dwgFileId: dwg.fileId }],
      }));
    });

    const deadline = Date.now() + 600_000;
    let status = 'queued';
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const row = await database.asService((db) => findJob(db, organization.id, jobId));
      status = row?.status ?? status;
      if (status === 'succeeded' || status === 'partial' || status === 'failed') break;
    }
    const elapsed = Date.now() - t0;
    await stub.close();
    setFakeWorkerDbForTests(null);

    expect(['succeeded', 'partial']).toContain(status);
    const view = await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      return getAnalysisViewUseCase(ctx, (await findJob(ctx.db, organization.id, jobId))!.analysisId);
    });
    const classified = view.detections.filter((d) => d.typeKey).length;
    const classifiedPct = view.detections.length ? (classified / view.detections.length) * 100 : 0;
    console.info(
      `[takeoff-real-worker] ${elapsed}ms status=${status} sheets=${view.sheets.length} detections=${view.detections.length} classified=${classifiedPct.toFixed(1)}% warnings=${view.workerWarnings.length} boqLines=${view.boq.lines.length}`,
    );
    expect(view.sheets.length).toBeGreaterThan(0);
  }, 600_000);
});