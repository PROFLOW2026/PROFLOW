import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { takeoffEditSchema, type Boq } from '@/modules/electrical-takeoff/domain/contracts';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { buildLegendLibraryEdit, visibleDetectionReasons } from '@/modules/electrical-takeoff/ui/takeoff-analysis-view';
import { buildLegendLibraryEntry, legendKeySignature } from '@/modules/electrical-takeoff/domain/library';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { sha1Hex } from '@/modules/electrical-takeoff/domain/sha1';
import { undecodedLegendExemplars } from '@/modules/electrical-takeoff/ui/symbol-group';
import {
  DEMO_ANALYSIS_ID,
  createMockTakeoffApi,
  resetTakeoffMockStore,
} from '@/modules/electrical-takeoff/ui/mock-api';
import { sheetDto, workerDet } from './fixtures';

function quantityFor(boq: Boq, typeKey: string): number {
  return boq.lines.filter((line) => line.typeKey === typeKey && !line.excluded).reduce((sum, line) => sum + line.quantity, 0);
}

describe('takeoff corrections', () => {
  it('drops the unclassified reason after a type is chosen and keeps other review reasons', () => {
    const base = [
      workerDet({
        id: 'p1#1',
        sheetKey: 'p1',
        typeKey: null,
        confidence: 'none',
        reasons: ['unclassified', 'low_confidence'],
        rawClass: 'C6',
      }),
    ];
    const [row] = applyEdits(base, [
      { op: 'reclassify', detectionId: 'p1#1', typeKey: 'control.switch.single', saveToLibrary: false },
    ]);
    expect(row?.typeKey).toBe('control.switch.single');
    expect(row?.reasons).not.toContain('unclassified');
    expect(row?.reasons).toContain('low_confidence');
    expect(row?.status).toBe('suggested');
    expect(row?.needsReview).toBe(true);
    expect(visibleDetectionReasons(row!).join(',')).not.toContain('unclassified');
  });

  it('increases the BOQ quantity by the number of marks reclassified, on the engine and the mock save', async () => {
    const typeKey = 'control.switch.single';
    const base = ['p1#1', 'p1#2', 'p1#8'].map((id) =>
      workerDet({
        id,
        sheetKey: 'p1',
        typeKey: null,
        confidence: 'none',
        reasons: ['unclassified'],
        rawClass: 'C6',
      }),
    );
    const sheets = [sheetDto({ sheetKey: 'p1' })];
    const catalog = mergeCatalog();
    const before = computeBoq({
      detections: applyEdits(base, []),
      sheets,
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const edits = base.map((row) => ({
      op: 'reclassify' as const,
      detectionId: row.id,
      typeKey,
      saveToLibrary: false,
    }));
    const saved = applyEdits(base, edits);
    const after = computeBoq({
      detections: saved,
      sheets,
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    expect(saved.map((row) => row.typeKey)).toEqual([typeKey, typeKey, typeKey]);
    expect(saved.every((row) => !row.reasons.includes('unclassified'))).toBe(true);
    expect(quantityFor(after, typeKey) - quantityFor(before, typeKey)).toBe(base.length);

    resetTakeoffMockStore('default');
    const api = createMockTakeoffApi('default');
    const view = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    const mark = view.detections.find((row) => row.id === 'p1#1');
    expect(mark?.typeKey).toBeNull();
    const switchKey = 'control.switch';
    const beforeQty = quantityFor(view.boq, switchKey);
    const returned = await api.applyEdits(
      DEMO_ANALYSIS_ID,
      [{ op: 'reclassify', detectionId: 'p1#1', typeKey: switchKey, saveToLibrary: false }],
      view.summary.revision,
    );
    const reread = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    const savedMark = returned.detections.find((row) => row.id === 'p1#1');
    const rereadMark = reread.detections.find((row) => row.id === 'p1#1');
    expect(savedMark?.typeKey).toBe(switchKey);
    expect(rereadMark?.typeKey).toBe(switchKey);
    expect(savedMark?.reasons ?? []).not.toContain('unclassified');
    expect(quantityFor(returned.boq, switchKey) - beforeQty).toBe(1);
    expect(quantityFor(reread.boq, switchKey)).toBe(quantityFor(returned.boq, switchKey));
  });

  it('stores a legend-key library entry when the symbol has zero plan occurrences', async () => {
    expect(sha1Hex('L42')).toBe(createHash('sha1').update('L42', 'utf8').digest('hex'));
    expect(sha1Hex('מפסק')).toBe(createHash('sha1').update('מפסק', 'utf8').digest('hex'));

    const rows = undecodedLegendExemplars([
      {
        id: 'legend-only',
        sheetKey: 'legend',
        rawClass: 'L42',
        typeKey: null,
        reasons: ['legend_zone'],
      },
    ]);
    expect(rows).toEqual([{ legendKey: 'L42', exemplarId: null, count: 0 }]);

    const typeKey = 'control.switch';
    const edit = buildLegendLibraryEdit(rows[0]!.legendKey, typeKey);
    expect(takeoffEditSchema.parse(edit)).toEqual({ op: 'save_legend', legendKey: 'L42', typeKey });

    const entry = buildLegendLibraryEntry({
      id: 'lib-legend-L42',
      plannerKey: '7155_light_g',
      legendKey: 'L42',
      typeKey,
    });
    expect(entry).toMatchObject({
      signatureKind: 'legend-key',
      signature: legendKeySignature('L42'),
      typeKey,
      label: 'L42',
    });
    expect(entry.signature.startsWith('legend:')).toBe(true);
    expect(entry.template).toBeUndefined();

    resetTakeoffMockStore('default');
    const api = createMockTakeoffApi('default');
    const view = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    await api.applyEdits(DEMO_ANALYSIS_ID, [edit!], view.summary.revision);
    const library = await api.listLibrary(view.summary.plannerKey);
    expect(library).toEqual([
      expect.objectContaining({
        signatureKind: 'legend-key',
        signature: entry.signature,
        typeKey,
      }),
    ]);
  });
});
