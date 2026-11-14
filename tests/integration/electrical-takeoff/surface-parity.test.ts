import { describe, expect, it } from 'vitest';
import type { ExternalContext } from '@/shared/external';
import { EXTERNAL_CAPABILITIES } from '@/shared/external/capabilities';
import { addProjectMember } from '@/modules/project-team';
import { resolveOrgContext } from '@/modules/tenancy';
import { authorizeTakeoffProject, externalActorFrom } from '@/modules/electrical-takeoff/application/access';
import { buildAnalysisView } from '@/modules/electrical-takeoff/application/get-analysis-view';
import {
  beginFileUploadUseCase,
  createAnalysisUseCase,
  getAnalysisViewUseCase,
  startAnalysisUseCase,
} from '@/modules/electrical-takeoff/application/use-cases';
import { handleTakeoffChunk, resetChunkBuffersForTests } from '@/modules/electrical-takeoff/application/chunk-upload';
import { setFakeWorkerDbForTests, setTakeoffFileStoreForTests, createInMemoryTakeoffFileStore } from '@/modules/electrical-takeoff/server';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { addOrgMember, createContractor, createProjectAs } from '../../setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

describe('takeoff three-surface parity (integration)', () => {
  it('manager employee and granted contractor can analyze with fake worker', async () => {
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
    process.env.TAKEOFF_USE_FAKE_WORKER = '1';
    process.env.TAKEOFF_FILE_STORE = 'memory';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    resetChunkBuffersForTests();
    const store = createInMemoryTakeoffFileStore();
    setTakeoffFileStoreForTests(store);
    await database.asService(async (db) => setFakeWorkerDbForTests(db));

    const owner = await createTestUser(database, 'parity-owner@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Parity Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Parity Project');
    const manager = await addOrgMember(database, organization.id, 'mgr', 'manager');
    const contractor = await createContractor(database, {
      organizationId: organization.id,
      projectId,
      label: 'takeoff-ctr',
      capabilities: [
        EXTERNAL_CAPABILITIES.TAKEOFF_VIEW,
        EXTERNAL_CAPABILITIES.TAKEOFF_MANAGE,
        EXTERNAL_CAPABILITIES.TAKEOFF_LIBRARY_MANAGE,
      ],
    });

    let analysisId = '';
    const planBytes = new TextEncoder().encode('%PDF-1.4');

    await database.asUser(owner.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const analysis = await createAnalysisUseCase(ownerCtx, projectId, { name: 'Parity run' });
      analysisId = analysis.id;
      const begun = await beginFileUploadUseCase(ownerCtx, analysis.id, {
        name: 'plan.pdf',
        sizeBytes: planBytes.length,
        kind: 'pdf',
      });
      await handleTakeoffChunk({
        db: ownerCtx.db,
        store,
        organizationId: organization.id,
        projectId,
        fileId: begun.fileId,
        kind: 'pdf',
        offset: 0,
        totalBytes: planBytes.length,
        sessionRaw: begun.fileId,
        bytes: planBytes,
      });
      await startAnalysisUseCase(ownerCtx, analysis.id, { fileIds: [begun.fileId] });
    });

    await database.asUser(owner.id, async (tx) => {
      const ownerCtx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      await addProjectMember(ownerCtx, { projectId, userId: manager.id, templateKey: 'project_manager_full' });
    });

    await database.asUser(manager.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: manager.id, organizationId: organization.id, locale: 'he' });
      const view = await getAnalysisViewUseCase(ctx, analysisId);
      expect(view.detections.length).toBeGreaterThan(0);
    });

    await database.asService(async (db) => {
      const ext: ExternalContext = {
        principalId: contractor.principalId,
        authUserId: contractor.authUser.id,
        displayName: null,
        locale: 'he',
        grants: [
          {
            grantId: contractor.grantId,
            organizationId: organization.id,
            vendorId: contractor.vendorId,
            projectId,
            subcontractAgreementId: contractor.agreementId,
            capabilities: new Set([
              EXTERNAL_CAPABILITIES.TAKEOFF_VIEW,
              EXTERNAL_CAPABILITIES.TAKEOFF_MANAGE,
            ]),
            expiresAt: null,
          },
        ],
        db,
      };
      await authorizeTakeoffProject({ kind: 'external', context: ext }, projectId, 'view');
      await authorizeTakeoffProject({ kind: 'external', context: ext }, projectId, 'manage');
      const contractorView = await buildAnalysisView(externalActorFrom(ext), analysisId);
      expect(contractorView.summary.id).toBe(analysisId);
      expect(contractorView.detections.length).toBeGreaterThan(0);
    });

    setFakeWorkerDbForTests(null);
  });
});