import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildExportBytes } from '@/modules/electrical-takeoff/application/export-download';
import { internalActorFrom } from '@/modules/electrical-takeoff/application/access';
import {
  approveAnalysisUseCase,
  applyEditsUseCase,
  createAnalysisUseCase,
  getAnalysisViewUseCase,
} from '@/modules/electrical-takeoff/application/use-cases';
import { parseWorkerResultPayload } from '@/modules/electrical-takeoff/domain/worker-json';
import { insertFile, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { applyWorkerResult } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { TAKEOFF_CONTRACT_VERSION } from '@/modules/electrical-takeoff/domain/contracts';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedSystem, createTestOrganization, createTestUser } from '../../setup/fixtures';
import { createProjectAs } from '../../setup/dg-fixtures';

const corpusPath = path.join(process.cwd(), 'takeoff-worker/.tmp/7155_light_g.json');

describe('buildExportBytes after corpus ingest', () => {
  it.skipIf(!existsSync(corpusPath))(
    'exports xlsx after 7155_light_g ingest',
    async () => {
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database, 'export-7155@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Export 7155');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'P');

    let analysisId = '';
    await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const analysis = await createAnalysisUseCase(ctx, projectId, { name: '7155 export' });
      analysisId = analysis.id;
    });

    await database.asService(async (db) => {
        const legend = await insertFile(db, {
          organizationId: organization.id,
          projectId,
          analysisId,
          name: '7155-A1-מקרא.pdf',
          kind: 'pdf',
          sizeBytes: 1,
          uploadState: 'complete',
        });
        const light = await insertFile(db, {
          organizationId: organization.id,
          projectId,
          analysisId,
          name: '7155-A1-תאורה ג.pdf',
          kind: 'pdf',
          sizeBytes: 1,
          uploadState: 'complete',
        });
        const dwg = await insertFile(db, {
          organizationId: organization.id,
          projectId,
          analysisId,
          name: '7155-A1.dwg',
          kind: 'dwg',
          sizeBytes: 1,
          uploadState: 'complete',
        });
        const job = await insertJob(db, {
          organizationId: organization.id,
          projectId,
          analysisId,
          status: 'running',
        });
        const raw = JSON.parse(readFileSync(corpusPath, 'utf8')) as Record<string, unknown>;
        raw.contractVersion = TAKEOFF_CONTRACT_VERSION;
        raw.jobId = job.id;
        const payload = parseWorkerResultPayload(raw);
        for (const d of payload.detections) {
          if (d.fileId === 'legend') d.fileId = legend.id;
          if (d.fileId === 'lightg') d.fileId = light.id;
          if (d.fileId === 'dwg') d.fileId = dwg.id;
        }
        for (const s of payload.sheets) {
          if (s.fileId === 'legend') s.fileId = legend.id;
          if (s.fileId === 'lightg') s.fileId = light.id;
          if (s.fileId === 'dwg') s.fileId = dwg.id;
        }
        await applyWorkerResult(db, job.id, payload);
    });

    await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
      const view = await getAnalysisViewUseCase(ctx, analysisId);
      const detectionIds = view.detections.map((d) => d.id);
      const cleared = await applyEditsUseCase(
        ctx,
        analysisId,
        [
          ...view.detections
            .filter((d) => !d.typeKey)
            .map((d) => ({
              op: 'reclassify' as const,
              detectionId: d.id,
              typeKey: 'power.socket.single',
              saveToLibrary: false,
            })),
          ...(detectionIds.length > 0 ? [{ op: 'confirm' as const, detectionIds }] : []),
        ],
        view.summary.revision,
      );
      const confirmedPlan = await applyEditsUseCase(
        ctx,
        analysisId,
        [{ op: 'confirm_plan_review', confirmed: true }],
        cleared.summary.revision,
      );
      const approved = await approveAnalysisUseCase(ctx, analysisId, confirmedPlan.summary.revision);
      expect(approved.summary.status).toBe('approved');
      const bytes = await buildExportBytes(internalActorFrom(ctx), analysisId, 'xlsx');
      expect(bytes.bytes.byteLength).toBeGreaterThan(10_000);
    });
    },
    300_000,
  );
});