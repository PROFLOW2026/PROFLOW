import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedSystem, createTestOrganization, createTestUser } from '../../setup/fixtures';
import { addOrgMember, createContractor, createProjectAs } from '../../setup/dg-fixtures';
import type { ExternalContext } from '@/shared/external';
import { EXTERNAL_CAPABILITIES } from '@/shared/external/capabilities';
import { authorizeTakeoffProject, internalActorFrom } from '@/modules/electrical-takeoff/application/access';
import { buildExportBytes } from '@/modules/electrical-takeoff/application/export-download';
import { getAnalysisViewUseCase } from '@/modules/electrical-takeoff/application/use-cases';
import { handleWorkerProgress, handleWorkerResult, setTakeoffRouteAdminDbForTests } from '@/modules/electrical-takeoff/routes';
import { insertAnalysis, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { sealJobToken } from '@/modules/electrical-takeoff/application/worker-token';
import { setFakeWorkerDbForTests } from '@/modules/electrical-takeoff/server';
import { resolveOrgContext } from '@/modules/tenancy';
import { handleTakeoffChunk, resetChunkBuffersForTests } from '@/modules/electrical-takeoff/application/chunk-upload';
import { TAKEOFF_CHUNK_BYTES } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { createAnalysisUseCase, beginFileUploadUseCase } from '@/modules/electrical-takeoff/application/use-cases';
import { setTakeoffFileStoreForTests, createInMemoryTakeoffFileStore } from '@/modules/electrical-takeoff/server';
import { authorizeWorkerJob } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { assertMagicMatchesDeclared } from '@/modules/electrical-takeoff/application/magic-bytes';
import { findFile } from '@/modules/electrical-takeoff/data/takeoff.repository';

describe('takeoff route security', () => {
  beforeAll(() => {
    process.env.TAKEOFF_FILE_STORE = 'memory';
    process.env.TAKEOFF_USE_FAKE_WORKER = '1';
  });

  it('rejects worker progress without bearer', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    const database = await createTakeoffTestDatabase();
    await database.asService(async (db) => {
      setTakeoffRouteAdminDbForTests(db);
      const jobId = randomUUID();
      const res = await handleWorkerProgress(
        new Request(`http://test/api/takeoff/worker/progress/${jobId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ percent: 10 }),
        }),
        jobId,
      );
      expect(res.status).toBe(401);
    });
    setTakeoffRouteAdminDbForTests(null);
  });

  it('rejects forged worker bearer for another job', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    const jobA = randomUUID();
    const jobB = randomUUID();
    const tokenA = sealJobToken(jobA, process.env.TAKEOFF_WORKER_SECRET, 60_000, Date.now());
    const database = await createTakeoffTestDatabase();
    await database.asService(async (db) => {
      const ok = await authorizeWorkerJob(db, jobB, tokenA.bearer, process.env.TAKEOFF_WORKER_SECRET!);
      expect(ok).toBeNull();
    });
  });

  it('accepts re-sealed bearer for the same job (export download)', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database, 'takeoff-reseal@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Reseal org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'P');
    let jobId = '';
    const analysisId = await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const analysis = await createAnalysisUseCase(ctx, projectId, { name: 'Reseal' });
      return analysis.id;
    });
    await database.asService(async (db) => {
      const original = sealJobToken(randomUUID(), process.env.TAKEOFF_WORKER_SECRET!, 60_000, Date.now());
      const job = await insertJob(db, {
        organizationId: organization.id,
        projectId,
        analysisId,
        status: 'running',
        tokenHash: original.hash,
      });
      jobId = job.id;
    });
    const resealed = sealJobToken(jobId, process.env.TAKEOFF_WORKER_SECRET!, 60_000, Date.now());
    await database.asService(async (db) => {
      const job = await authorizeWorkerJob(db, jobId, resealed.bearer, process.env.TAKEOFF_WORKER_SECRET!);
      expect(job?.id).toBe(jobId);
    });
  });

  it('denies upload for user on another org project', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    process.env.TAKEOFF_USE_FAKE_WORKER = '1';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    resetChunkBuffersForTests();
    const store = createInMemoryTakeoffFileStore();
    setTakeoffFileStoreForTests(store);
    const ownerA = await createTestUser(database, 'takeoff-a@example.test');
    const ownerB = await createTestUser(database, 'takeoff-b@example.test');
    const orgA = await createTestOrganization(database, ownerA, 'Org A');
    const orgB = await createTestOrganization(database, ownerB, 'Org B');
    const projectA = await createProjectAs(database, ownerA.id, orgA.organization.id, 'Project A');

    await database.asUser(ownerB.id, async (tx) => {
      const contextB = await resolveOrgContext(tx, { userId: ownerB.id, organizationId: orgB.organization.id, locale: 'he' });
      await expect(createAnalysisUseCase(contextB, projectA, { name: 'X' })).rejects.toBeTruthy();
    });
  });

  it('blocks wrong magic bytes on first chunk', () => {
    const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(assertMagicMatchesDeclared(zipHead, 'pdf')).toBe(false);
    const pdfHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(assertMagicMatchesDeclared(pdfHead, 'pdf')).toBe(true);
    const dwgHead = new TextEncoder().encode('AC1018');
    expect(assertMagicMatchesDeclared(dwgHead, 'dwg')).toBe(true);
  });

  it('rejects chunks larger than TAKEOFF_CHUNK_BYTES', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database);
    const { organization } = await createTestOrganization(database, owner, 'Chunk Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Chunk Project');
    resetChunkBuffersForTests();
    const store = createInMemoryTakeoffFileStore();
    setTakeoffFileStoreForTests(store);
    await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const analysis = await createAnalysisUseCase(ctx, projectId, { name: 'A' });
      const begun = await beginFileUploadUseCase(ctx, analysis.id, { name: 'big.pdf', sizeBytes: TAKEOFF_CHUNK_BYTES + 1, kind: 'pdf' });
      const oversize = new Uint8Array(TAKEOFF_CHUNK_BYTES + 1);
      await expect(
        handleTakeoffChunk({
          db: ctx.db,
          store,
          organizationId: ctx.organizationId,
          projectId,
          fileId: begun.fileId,
          kind: 'pdf',
          offset: 0,
          totalBytes: TAKEOFF_CHUNK_BYTES + 1,
          sessionRaw: begun.fileId,
          bytes: oversize,
        }),
      ).rejects.toMatchObject({ takeoffCode: 'file_too_large' });
    });
  });

  it('rejects expired worker result bearer over HTTP', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    await database.asService(async (db) => {
      setTakeoffRouteAdminDbForTests(db);
      setFakeWorkerDbForTests(db);
      const user = await createTestUser(database);
      const { organization } = await createTestOrganization(database, user, 'Worker HTTP');
      const projectId = await createProjectAs(database, user.id, organization.id, 'P');
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'A',
        createdByActorType: 'internal',
      });
      const jobId = randomUUID();
      const expired = sealJobToken(jobId, process.env.TAKEOFF_WORKER_SECRET!, -1000, Date.now() - 60_000);
      await insertJob(db, {
        id: jobId,
        organizationId: organization.id,
        projectId,
        analysisId: analysis.id,
        status: 'running',
        tokenHash: expired.hash,
        tokenExpiresAt: new Date(expired.expiresAtMs),
      });
      const res = await handleWorkerResult(
        new Request('http://test/api/takeoff/worker/result/' + jobId, {
          method: 'POST',
          headers: { authorization: `Bearer ${expired.bearer}`, 'content-type': 'application/json' },
          body: JSON.stringify({ contractVersion: 2, jobId, status: 'succeeded', sheets: [], detections: [] }),
        }),
        jobId,
      );
      expect(res.status).toBe(401);
    });
    setTakeoffRouteAdminDbForTests(null);
    setFakeWorkerDbForTests(null);
  });

  it('denies employee role without takeoff.view', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database);
    const { organization } = await createTestOrganization(database, owner, 'Emp Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'P');
    const employee = await addOrgMember(database, organization.id, 'no-takeoff', 'employee');
    let analysisId = '';
    await database.asUser(owner.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      analysisId = (await createAnalysisUseCase(ownerCtx, projectId, { name: 'hidden' })).id;
    });
    await database.asUser(employee.id, async (tx) => {
      const empCtx = await resolveOrgContext(tx, { userId: employee.id, organizationId: organization.id, locale: 'he' });
      await expect(getAnalysisViewUseCase(empCtx, analysisId)).rejects.toBeTruthy();
    });
  }, 30_000);

  it('denies contractor without takeoff grant', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database);
    const { organization } = await createTestOrganization(database, owner, 'Ctr Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'P');
    const contractor = await createContractor(database, {
      organizationId: organization.id,
      projectId,
      label: 'no-takeoff',
      capabilities: [EXTERNAL_CAPABILITIES.DOCUMENT_VIEW],
    });
    await database.asService(async (db) => {
      const ext: ExternalContext = {
        principalId: contractor.principalId,
        authUserId: contractor.authUser.id,
        displayName: null,
        locale: 'en',
        grants: [
          {
            grantId: contractor.grantId,
            organizationId: organization.id,
            vendorId: contractor.vendorId,
            projectId,
            subcontractAgreementId: contractor.agreementId,
            capabilities: new Set([EXTERNAL_CAPABILITIES.DOCUMENT_VIEW]),
            expiresAt: null,
          },
        ],
        db,
      };
      await expect(authorizeTakeoffProject({ kind: 'external', context: ext }, projectId, 'view')).rejects.toBeTruthy();
    });
  });

  it('blocks export bytes for analysis in another organization', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const ownerA = await createTestUser(database, 'exp-a@test');
    const ownerB = await createTestUser(database, 'exp-b@test');
    const orgA = await createTestOrganization(database, ownerA, 'Org Exp A');
    const orgB = await createTestOrganization(database, ownerB, 'Org Exp B');
    const projectA = await createProjectAs(database, ownerA.id, orgA.organization.id, 'PA');
    let analysisId = '';
    await database.asUser(ownerA.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: ownerA.id, organizationId: orgA.organization.id, locale: 'he' });
      analysisId = (await createAnalysisUseCase(ctx, projectA, { name: 'secret' })).id;
    });
    await database.asUser(ownerB.id, async (tx) => {
      const ctxB = await resolveOrgContext(tx, { userId: ownerB.id, organizationId: orgB.organization.id, locale: 'he' });
      await expect(buildExportBytes(internalActorFrom(ctxB), analysisId, 'xlsx')).rejects.toBeTruthy();
    });
  });

  it('sanitizes path traversal file names at upload begin', async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database);
    const { organization } = await createTestOrganization(database, owner, 'Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'P');
    await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const analysis = await createAnalysisUseCase(ctx, projectId, { name: 'A' });
      const bad = await beginFileUploadUseCase(ctx, analysis.id, { name: '..\\..\\evil.pdf', sizeBytes: 8, kind: 'pdf' });
      const row = await findFile(ctx.db, ctx.organizationId, bad.fileId);
      expect(row?.name).toBe('evil.pdf');
    });
  });
});