import { describe, expect, it } from 'vitest';

import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { applyUnpairedPdfPolicy } from '@/modules/electrical-takeoff/domain/unpaired-pdf-policy';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';
import { sheetDto, workerDet } from './fixtures';

describe('unpaired PDF + DWG counting integrity', () => {
  const catalog = mergeCatalog();

  it('tags unpaired plan PDF when DWG layouts exist', () => {
    const sheets = [
      sheetDto({ sheetKey: 'p1', fileId: 'lightg', name: 'תאורה ג' }),
      sheetDto({ sheetKey: 'layout:L', fileId: 'dwg', kind: 'dwg_layout', name: 'תאורה ג' }),
    ];
    const base = [
      workerDet({ id: 'pdf-1', sheetKey: 'p1', fileId: 'lightg', source: 'pdf' }),
      workerDet({ id: 'dwg-1', sheetKey: 'layout:L', fileId: 'dwg', source: 'dwg' }),
    ];
    const effective = applyEdits(base, []);
    const { unpairedPdfTagged } = applyUnpairedPdfPolicy(
      effective,
      sheets,
      new Map(),
      base,
      new Map(base.map((d) => [d.id, d.fileId])),
    );
    expect(unpairedPdfTagged).toBe(1);
    const boq = computeBoq({
      detections: effective,
      workerDetections: base,
      sheets,
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: new Map(base.map((d) => [d.id, d.twinId])),
      detectionFileIdById: new Map(base.map((d) => [d.id, d.fileId])),
    });
    expect(boq.counting?.countedTotal).toBe(1);
    expect(boq.counting?.excluded.pdfOnly).toBe(1);
    expect(boq.counting?.composition?.dwgCounted).toBe(1);
    expect(boq.counting?.composition?.pdfCounted).toBe(0);
  });

  it('paired 7155 corpus collapses twins (~250 countable)', () => {
    const { view, workerBase } = getReal7155Fixture();
    const twinMap = new Map(workerBase.map((d) => [d.id, d.twinId]));
    const mergePairs = (view.workerStats?.merge_matched_pairs ?? 0) as number;
    const boqFull = computeBoq({
      detections: view.detections,
      workerDetections: workerBase,
      sheets: view.sheets,
      areas: [],
      catalog: view.catalog,
      ruleSet: view.ruleSet,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: twinMap,
      detectionFileIdById: new Map(workerBase.map((d) => [d.id, d.fileId])),
      mergeMatchedPairs: mergePairs >= 20 ? mergePairs : undefined,
    });
    if (mergePairs >= 20) {
      expect(boqFull.counting?.countedTotal).toBe(250);
    } else {
      const dwgOnly = workerBase.filter((d) => d.source === 'dwg' && !d.reasons.includes('legend_zone')).length;
      expect(boqFull.counting?.countedTotal).toBeLessThanOrEqual(dwgOnly);
      expect(boqFull.counting?.excluded.pdfOnly).toBeGreaterThan(150);
    }
  });

  it('simulated E2E unpaired marks all lightg PDF as pdf_only (DWG-only BOQ)', () => {
    const { view, workerBase } = getReal7155Fixture();
    const unpairedBase = workerBase.map((d) => {
      if (d.source !== 'pdf' || d.fileId !== 'lightg') return d;
      const reasons = d.reasons.filter((r) => r !== 'pdf_only');
      return { ...d, twinId: undefined, reasons };
    });
    const detections = applyEdits(unpairedBase, []);
    const twinMap = new Map(unpairedBase.map((d) => [d.id, d.twinId]));
    const boq = computeBoq({
      detections,
      workerDetections: unpairedBase,
      sheets: view.sheets,
      areas: [],
      catalog: view.catalog,
      ruleSet: view.ruleSet,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: twinMap,
      detectionFileIdById: new Map(unpairedBase.map((d) => [d.id, d.fileId])),
    });
    const dwgCountable = unpairedBase.filter(
      (d) => d.source === 'dwg' && !d.reasons.includes('legend_zone'),
    ).length;
    expect(boq.counting?.countedTotal).toBe(dwgCountable);
    expect(boq.counting?.excluded.pdfOnly).toBeGreaterThan(150);
  });

  it('pdf-only analysis still counts plan PDF minus legend_zone', () => {
    const sheets = [sheetDto({ sheetKey: 'p1', fileId: 'plan' })];
    const base = [
      workerDet({ id: 'a', sheetKey: 'p1', fileId: 'plan', source: 'pdf' }),
      workerDet({ id: 'b', sheetKey: 'p1', fileId: 'plan', source: 'pdf', reasons: ['legend_zone'] }),
    ];
    const boq = computeBoq({
      detections: applyEdits(base, []),
      sheets,
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    expect(boq.counting?.countedTotal).toBe(1);
    expect(boq.counting?.excluded.legendZone).toBe(1);
  });

  it('user confirm on unpaired pdf_only includes in BOQ', () => {
    const sheets = [
      sheetDto({ sheetKey: 'p1', fileId: 'lightg' }),
      sheetDto({ sheetKey: 'layout:L', fileId: 'dwg', kind: 'dwg_layout' }),
    ];
    const base = [
      workerDet({ id: 'pdf-u', sheetKey: 'p1', fileId: 'lightg', source: 'pdf', reasons: ['pdf_only'] }),
      workerDet({ id: 'dwg-1', sheetKey: 'layout:L', fileId: 'dwg', source: 'dwg' }),
    ];
    const boq = computeBoq({
      detections: applyEdits(base, [{ op: 'confirm', detectionIds: ['pdf-u'] }]),
      sheets,
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: new Map(),
      detectionFileIdById: new Map(base.map((d) => [d.id, d.fileId])),
    });
    expect(boq.counting?.countedTotal).toBe(2);
  });
});