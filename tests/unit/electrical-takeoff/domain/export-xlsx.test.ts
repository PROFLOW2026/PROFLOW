import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { exportTakeoffBoqXlsx } from '@/modules/electrical-takeoff/application/export-xlsx';
import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { enrichDetectionsWithLegendIdentity } from '@/modules/electrical-takeoff/domain/legend-identity';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import type { WorkerLegendEntry } from '@/modules/electrical-takeoff/domain/contracts';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';
import { sheetDto, workerDet } from './fixtures';

describe('exportTakeoffBoqXlsx', () => {
  it('round-trips workbook sheets', async () => {
    const catalog = mergeCatalog();
    const base = [workerDet({ id: 'a', sheetKey: 'p1' })];
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const buf = await exportTakeoffBoqXlsx({
      title: 'בדיקה',
      boq,
      catalog,
      detections: applyEdits(base, []),
      sheets: [sheetDto({ sheetKey: 'p1' })],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.getWorksheet('סיכום כתב כמויות')).toBeDefined();
    expect(wb.getWorksheet('אזהרות ומגבלות')?.getRow(1).getCell(1).value).toBeTruthy();
  });

  it('formats quantity cells when summary has many BOQ lines', async () => {
    const catalog = mergeCatalog();
    const lines = Array.from({ length: 40 }, (_, i) => ({
      key: `line-${i}`,
      typeKey: 'light.recessed',
      label: `סוג ${i}`,
      category: 'lighting' as const,
      unit: 'יח',
      quantity: i + 1,
      floor: null,
      areaId: null,
      ruleId: null,
      breakdown: { high: i + 1, medium: 0, low: 0, unclassified: 0, userAdded: 0, userConfirmed: 0 },
      verified: false,
      excluded: false,
      lineKind: 'fixture_count' as const,
      detectionIds: [`d-${i}`],
    }));
    const boq = {
      lines,
      unclassifiedCount: 0,
      needsReviewCount: 0,
      completeness: {
        sheetsTotal: 1,
        sheetsFullyAnalyzed: 1,
        partialSheets: [],
        skippedSheets: [],
        xrefsMissing: [],
        scaleUnverifiedSheets: [],
      },
      warnings: [],
      state: 'approved' as const,
    };
    const buf = await exportTakeoffBoqXlsx({
      title: 'רב שורות',
      boq,
      catalog,
      detections: [],
      sheets: [sheetDto({ sheetKey: 'p1' })],
    });
    expect(buf.byteLength).toBeGreaterThan(500);
  });

  it('exports after E2E-like add/delete edits on 7155 view', async () => {
    const { view, workerBase } = getReal7155Fixture();
    const id0 = workerBase[0]!.id;
    const id1 = workerBase[1]!.id;
    const detections = applyEdits(workerBase, [
      { op: 'delete', detectionId: id1 },
      {
        op: 'add',
        tempId: 'user-new-1',
        sheetKey: 'p1',
        typeKey: 'light.recessed',
        x: 100,
        y: 100,
      },
    ]);
    const boq = computeBoq({
      detections,
      workerDetections: workerBase,
      sheets: view.sheets,
      areas: [],
      catalog: view.catalog,
      ruleSet: view.ruleSet,
      linear: [],
      state: 'approved',
      twinIdByDetectionId: new Map(workerBase.map((d) => [d.id, d.twinId])),
      detectionFileIdById: new Map(workerBase.map((d) => [d.id, d.fileId])),
      mergeMatchedPairs: 151,
    });
    const buf = await exportTakeoffBoqXlsx({
      title: view.summary.name,
      boq,
      catalog: view.catalog,
      detections,
      sheets: view.sheets,
      approvedAtIso: new Date().toISOString(),
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
    void id0;
  });

  it('writes an org-custom accessory name on the summary sheet', async () => {
    const catalog = mergeCatalog({
      customTypes: [
        {
          key: 'custom.control.stair',
          category: 'control',
          role: 'device',
          nameHe: 'לחצן חדר מדרגות',
          unit: "יח'",
          keywordsHe: [],
          colorHex: '#7f7f7f',
          builtIn: false,
          archived: false,
        },
      ],
    });
    const boq = computeBoq({
      detections: applyEdits(
        [workerDet({ id: 'a', sheetKey: 'p1', typeKey: 'custom.control.stair', confidence: 'high' })],
        [],
      ),
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const buf = await exportTakeoffBoqXlsx({
      title: 'מותאם',
      boq,
      catalog,
      detections: applyEdits(
        [workerDet({ id: 'a', sheetKey: 'p1', typeKey: 'custom.control.stair', confidence: 'high' })],
        [],
      ),
      sheets: [sheetDto({ sheetKey: 'p1' })],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const labels: string[] = [];
    wb.getWorksheet('סיכום כתב כמויות')?.eachRow((row) => {
      labels.push(String(row.getCell(1).value ?? ''));
    });
    expect(labels.join(' ')).toContain('לחצן חדר מדרגות');
  });

  it('exports full 7155 corpus view without throwing', async () => {
    const { view } = getReal7155Fixture();
    const buf = await exportTakeoffBoqXlsx({
      title: view.summary.name,
      boq: { ...view.boq, state: 'approved' },
      catalog: view.catalog,
      detections: view.detections,
      sheets: view.sheets,
      approvedAtIso: new Date().toISOString(),
    });
    expect(buf.byteLength).toBeGreaterThan(1000);
  });

  it('writes an undetermined quantity as a dash, not zero', async () => {
    const catalog = mergeCatalog();
    const legend: WorkerLegendEntry = {
      key: 'row:cable',
      fileId: 'f1',
      sheetKey: 'layout:F0',
      signature: 'block:n2xy',
      signatureKind: 'dwg-block',
      rawText: '(4x150) N2XY+70CU',
      decodedText: '(4x150) N2XY+70CU',
      reasons: [],
    };
    const detections = enrichDetectionsWithLegendIdentity(
      applyEdits(
        Array.from({ length: 91 }, (_, i) =>
          workerDet({
            id: `c${i}`,
            sheetKey: 'p1',
            typeKey: null,
            classifiedBy: 'none',
            legendRowIds: ['row:cable'],
            reasons: ['unclassified'],
          }),
        ),
        [],
      ),
      [legend],
    );
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const buf = await exportTakeoffBoqXlsx({
      title: 'כבל',
      boq,
      catalog,
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.getWorksheet('סיכום כתב כמויות');
    const quantities: Array<string | number> = [];
    const notes: string[] = [];
    sheet?.eachRow((row, index) => {
      if (index === 1) return;
      quantities.push(row.getCell(4).value as string | number);
      notes.push(String(row.getCell(6).value ?? ''));
    });
    expect(quantities).toContain('—');
    expect(quantities).not.toContain(0);
    expect(quantities).not.toContain(91);
    expect(notes.some((note) => note.includes('חסר אורך מדיד'))).toBe(true);
  });
});