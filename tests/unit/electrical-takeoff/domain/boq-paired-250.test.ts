import { describe, expect, it } from 'vitest';

import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { sheetDto, workerDet } from './fixtures';

/** Synthetic paired merge: 150 PDF+DWG twins + 46 legend_zone + מקרא — mirrors corpus 7155 (~250 countable). */
describe('paired merge BOQ (~250)', () => {
  it('collapses twins when merge_matched_pairs >= 20', () => {
    const catalog = mergeCatalog();
    const sheets = [
      sheetDto({ sheetKey: 'p1', fileId: 'lightg', name: 'תאורה ג' }),
      sheetDto({ sheetKey: 'layout:תאורה ג', fileId: 'dwg', kind: 'dwg_layout' }),
    ];
    const base = [];
    for (let i = 0; i < 150; i++) {
      const twin = `twin-${i}`;
      base.push(workerDet({ id: `pdf-${i}`, sheetKey: 'p1', fileId: 'lightg', source: 'pdf', twinId: twin }));
      base.push(workerDet({ id: `dwg-${i}`, sheetKey: 'layout:תאורה ג', fileId: 'dwg', source: 'dwg', twinId: twin }));
    }
    for (let i = 0; i < 69; i++) {
      base.push(workerDet({ id: `dwg-u${i}`, sheetKey: 'layout:תאורה ג', fileId: 'dwg', source: 'dwg', reasons: ['dwg_only'] }));
    }
    for (let i = 0; i < 31; i++) {
      base.push(workerDet({ id: `dwg-m${i}`, sheetKey: 'layout:מקרא', fileId: 'dwg', source: 'dwg' }));
    }
    for (let i = 0; i < 46; i++) {
      base.push(
        workerDet({ id: `lz-${i}`, sheetKey: 'p1', fileId: 'lightg', source: 'pdf', reasons: ['legend_zone'] }),
      );
    }
    for (let i = 0; i < 32; i++) {
      base.push(
        workerDet({ id: `po-${i}`, sheetKey: 'p1', fileId: 'lightg', source: 'pdf', reasons: ['pdf_only'] }),
      );
    }
    const twinMap = new Map(base.map((d) => [d.id, d.twinId]));
    const boq = computeBoq({
      detections: applyEdits(base, []),
      workerDetections: base,
      sheets,
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
      twinIdByDetectionId: twinMap,
      detectionFileIdById: new Map(base.map((d) => [d.id, d.fileId])),
      mergeMatchedPairs: 150,
    });
    expect(boq.counting?.countedTotal).toBe(250);
    expect(boq.counting?.excluded.legendZone).toBe(46);
    expect(boq.counting?.excluded.pdfOnly).toBe(32);
    expect(boq.counting?.twinsCollapsed).toBe(150);
  });
});