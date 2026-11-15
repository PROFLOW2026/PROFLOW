import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { exportTakeoffBoqXlsx } from '@/modules/electrical-takeoff/application/export-xlsx';
import {
  applyEditsUseCase,
  approveAnalysisUseCase,
  getAnalysisViewUseCase,
} from '@/modules/electrical-takeoff/application/use-cases';
import { applyWorkerResult } from '@/modules/electrical-takeoff/application/worker-callbacks';
import { insertAnalysis, insertFile, insertJob } from '@/modules/electrical-takeoff/data/takeoff.repository';
import { TAKEOFF_CONTRACT_VERSION, type WorkerDetection, type WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';
import { TakeoffError } from '@/modules/electrical-takeoff/domain/errors';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProjectAs } from '../../setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';

function quantityOf(lines: { typeKey: string | null; quantity: number; excluded?: boolean }[], typeKey: string): number {
  return lines.filter((line) => !line.excluded && line.typeKey === typeKey).reduce((sum, line) => sum + line.quantity, 0);
}

describe('saved takeoff edits survive reopen', () => {
  it('keeps manual corrections through refresh, reopen, approval, and export', async () => {
    process.env.TAKEOFF_FORCE_PERSISTENT = '1';
    const database = await createTakeoffTestDatabase();
    await seedSystem(database);
    const owner = await createTestUser(database, 'takeoff-persist@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Takeoff Persist Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Persist');

    const analysisId = await database.asService(async (db) => {
      const analysis = await insertAnalysis(db, {
        organizationId: organization.id,
        projectId,
        name: 'שמירה',
        createdByActorType: 'internal',
      });
      const file = await insertFile(db, {
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
      const mark = (id: string, typeKey: string | null, x: number): WorkerDetection => ({
        id,
        sheetKey: 'p1',
        fileId: file.id,
        source: 'pdf' as const,
        x,
        y: 10,
        w: 14,
        h: 14,
        signature: `sig-${id}`,
        signatureKind: 'pdf-shape' as const,
        rawClass: typeKey ? 'L1' : 'L13',
        typeKey,
        classifiedBy: typeKey ? ('legend_text' as const) : ('none' as const),
        confidence: typeKey ? ('medium' as const) : ('none' as const),
        reasons: typeKey ? [] : ['unclassified'],
      });
      const result: WorkerResult = {
        contractVersion: TAKEOFF_CONTRACT_VERSION,
        jobId: job.id,
        status: 'succeeded',
        startedAtIso: new Date().toISOString(),
        finishedAtIso: new Date().toISOString(),
        sheets: [
          {
            sheetKey: 'p1',
            fileId: file.id,
            name: 'חשמל',
            kind: 'pdf_page',
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
        detections: [
          mark('p1#1', 'power.socket.single', 10),
          mark('p1#2', 'power.socket.single', 30),
          mark('p1#3', 'control.switch.single', 50),
          mark('p1#4', null, 70),
        ],
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
      const before = await getAnalysisViewUseCase(ctx, analysisId);
      const edited = await applyEditsUseCase(
        ctx,
        analysisId,
        [
          { op: 'delete', detectionId: 'p1#4' },
          { op: 'add', tempId: 'user-switch', sheetKey: 'p1', x: 90, y: 20, typeKey: 'control.switch.single' },
          { op: 'reclassify', detectionId: 'p1#3', typeKey: 'light.point', saveToLibrary: false },
          { op: 'set_note', detectionId: 'p1#1', tagText: 'X2' },
          { op: 'set_note', detectionId: 'user-switch', tagText: '×3' },
        ],
        before.summary.revision,
      );

      const refreshed = await getAnalysisViewUseCase(ctx, analysisId);
      expect(refreshed.summary.revision).toBe(edited.summary.revision);
      expect(refreshed.detections.map((d) => d.id).sort()).toEqual(['p1#1', 'p1#2', 'p1#3', 'user-switch']);
      expect(refreshed.detections.find((d) => d.id === 'p1#1')?.tagText).toBe('X2');
      expect(refreshed.detections.find((d) => d.id === 'p1#3')?.typeKey).toBe('light.point');
      expect(quantityOf(refreshed.boq.lines, 'power.socket.single')).toBe(3);
      expect(quantityOf(refreshed.boq.lines, 'control.switch.single')).toBe(3);
      expect(quantityOf(refreshed.boq.lines, 'light.point')).toBe(1);
      expect(refreshed.boq.unclassifiedCount).toBe(0);
      expect(refreshed.planReviewConfirmed).toBe(false);

      await expect(approveAnalysisUseCase(ctx, analysisId, refreshed.summary.revision)).rejects.toMatchObject({
        takeoffCode: 'approval_blocked_plan_review',
      });

      const confirmed = await applyEditsUseCase(
        ctx,
        analysisId,
        [{ op: 'confirm_plan_review', confirmed: true }],
        refreshed.summary.revision,
      );
      const reopened = await getAnalysisViewUseCase(ctx, analysisId);
      expect(reopened.planReviewConfirmed).toBe(true);
      expect(reopened.summary.revision).toBe(confirmed.summary.revision);
      expect(quantityOf(reopened.boq.lines, 'power.socket.single')).toBe(3);
      expect(quantityOf(reopened.boq.lines, 'control.switch.single')).toBe(3);
      expect(quantityOf(reopened.boq.lines, 'light.point')).toBe(1);

      const approved = await approveAnalysisUseCase(ctx, analysisId, reopened.summary.revision);
      expect(approved.summary.status).toBe('approved');
      const afterApproval = await getAnalysisViewUseCase(ctx, analysisId);
      expect(afterApproval.summary.status).toBe('approved');
      expect(quantityOf(afterApproval.boq.lines, 'power.socket.single')).toBe(3);
      expect(quantityOf(afterApproval.boq.lines, 'control.switch.single')).toBe(3);
      expect(quantityOf(afterApproval.boq.lines, 'light.point')).toBe(1);

      const bytes = await exportTakeoffBoqXlsx({
        title: afterApproval.summary.name,
        boq: afterApproval.boq,
        catalog: afterApproval.catalog,
        detections: afterApproval.detections,
        sheets: afterApproval.sheets,
        approvedAtIso: afterApproval.summary.approvedAtIso,
      });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const summary = workbook.getWorksheet('סיכום כתב כמויות');
      const exported = new Map<string, number>();
      summary?.eachRow((row, index) => {
        if (index === 1) return;
        const label = String(row.getCell(1).value ?? '');
        const quantity = Number(row.getCell(4).value);
        exported.set(label, (exported.get(label) ?? 0) + quantity);
      });
      const expected = new Map<string, number>();
      for (const line of afterApproval.boq.lines.filter((line) => !line.excluded && line.lineKind !== 'manual')) {
        expected.set(line.label, (expected.get(line.label) ?? 0) + line.quantity);
      }
      expect(exported).toEqual(expected);
      expect([...expected.values()].sort((a, b) => a - b)).toEqual([1, 3, 3]);
    });
  }, 180_000);

  it('rejects approval with the plan-review error type', () => {
    expect(new TakeoffError('approval_blocked_plan_review').takeoffCode).not.toBe('approval_blocked_review');
  });
});
