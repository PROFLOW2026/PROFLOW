import { describe, expect, it } from 'vitest';

import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import { mergeCatalog } from '@/modules/electrical-takeoff/domain/catalog';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import {
  boqQuantityDisplay,
  enrichDetectionsWithLegendIdentity,
  isQuantityIdentityLine,
  isUndeterminedQuantityLine,
  takeoffBoqApprovalBlocked,
} from '@/modules/electrical-takeoff/domain/legend-identity';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { buildReviewGroups } from '@/modules/electrical-takeoff/ui/review-guide';
import type { WorkerLegendEntry } from '@/modules/electrical-takeoff/domain/contracts';
import { sheetDto, workerDet } from './fixtures';

const catalog = mergeCatalog();

function legend(partial: Partial<WorkerLegendEntry> & Pick<WorkerLegendEntry, 'key' | 'decodedText'>): WorkerLegendEntry {
  return {
    fileId: 'f1',
    sheetKey: 'layout:F0',
    signature: 'block:stair',
    signatureKind: 'dwg-block',
    rawText: partial.decodedText,
    reasons: [],
    ...partial,
  };
}

describe('BOQ from planner legend', () => {
  it('counts unambiguous legend matches under the original name without a catalog typeKey', () => {
    const base = Array.from({ length: 35 }, (_, i) =>
      workerDet({
        id: `d${i}`,
        sheetKey: 'p1',
        typeKey: null,
        classifiedBy: 'none',
        confidence: 'none',
        signature: 'block:stair',
        rawClass: 'stair',
        legendRowIds: ['row:1'],
        reasons: ['unclassified', 'legend_unmapped'],
      }),
    );
    const detections = enrichDetectionsWithLegendIdentity(applyEdits(base, []), [
      legend({ key: 'row:1', decodedText: 'לחצן חדר מדרגות' }),
    ]);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const line = boq.lines.find((row) => row.originalLabel === 'לחצן חדר מדרגות');
    expect(line?.quantity).toBe(35);
    expect(line?.typeKey).toBeNull();
    expect(line?.identitySource).toBe('legend');
    expect(line?.label).toBe('לחצן חדר מדרגות');
    expect(boq.unclassifiedCount).toBe(0);
    expect(boq.needsReviewCount).toBe(0);
    expect(buildReviewGroups(detections)).toHaveLength(0);
  });

  it('puts the original planner sentence on the BOQ and skips guided review even when the catalog has no typeKey', () => {
    const base = Array.from({ length: 7 }, (_, i) =>
      workerDet({
        id: `s${i}`,
        sheetKey: 'p1',
        typeKey: 'power.socket.single',
        classifiedBy: 'legend_text',
        confidence: 'low',
        signature: 'block:8e',
        rawClass: '8e',
        legendRowIds: ['row:socket'],
        reasons: ['type_ambiguous'],
      }),
    );
    const detections = enrichDetectionsWithLegendIdentity(applyEdits(base, []), [
      legend({ key: 'row:socket', decodedText: 'בית תקע חד פאזי 16 אמפר מוגן מים', signature: 'block:8e' }),
    ]);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const line = boq.lines.find((row) => row.originalLabel === 'בית תקע חד פאזי 16 אמפר מוגן מים');
    expect(line?.label).toBe('בית תקע חד פאזי 16 אמפר מוגן מים');
    expect(line?.quantity).toBe(7);
    expect(line?.identitySource).toBe('legend');
    expect(boq.needsReviewCount).toBe(0);
    expect(buildReviewGroups(detections)).toHaveLength(0);
  });

  it('does not merge two different legend names that share a catalog type', () => {
    const base = [
      workerDet({
        id: 'a',
        sheetKey: 'p1',
        typeKey: 'control.switch.single',
        classifiedBy: 'legend_text',
        signature: 'block:s1',
        legendRowIds: ['row:a'],
        reasons: [],
      }),
      workerDet({
        id: 'b',
        sheetKey: 'p1',
        typeKey: 'control.switch.single',
        classifiedBy: 'legend_text',
        signature: 'block:s2',
        legendRowIds: ['row:b'],
        reasons: [],
      }),
    ];
    const detections = enrichDetectionsWithLegendIdentity(applyEdits(base, []), [
      legend({ key: 'row:a', decodedText: 'מפסק יחיד', signature: 'block:s1' }),
      legend({ key: 'row:b', decodedText: 'לחצן חדר מדרגות', signature: 'block:s2' }),
    ]);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const labels = boq.lines.filter((row) => !row.excluded).map((row) => row.label).sort();
    expect(labels).toEqual(['לחצן חדר מדרגות', 'מפסק יחיד']);
    expect(boq.lines.reduce((sum, row) => sum + row.quantity, 0)).toBe(2);
  });

  it('does not present 91 cable-legend inserts as 91 accessories', () => {
    const base = Array.from({ length: 91 }, (_, i) =>
      workerDet({
        id: `c${i}`,
        sheetKey: 'p1',
        typeKey: null,
        classifiedBy: 'none',
        confidence: 'none',
        signature: 'block:n2xy',
        rawClass: 'n2xy',
        legendRowIds: ['row:cable'],
        reasons: ['unclassified', 'legend_unmapped'],
      }),
    );
    const detections = enrichDetectionsWithLegendIdentity(applyEdits(base, []), [
      legend({ key: 'row:cable', decodedText: '(4x150) N2XY+70CU', signature: 'block:n2xy' }),
    ]);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const line = boq.lines.find((row) => row.originalLabel === '(4x150) N2XY+70CU');
    expect(line?.quantity).toBe(0);
    expect(line?.symbolCount).toBe(91);
    expect(line?.identitySource).toBe('uncertain');
    expect(line?.unit).toBe('מ׳');
    expect(boq.lines.some((row) => row.identitySource === 'legend' && row.quantity === 91)).toBe(false);
    expect(detections.every((row) => row.needsReview)).toBe(true);
    expect(isUndeterminedQuantityLine(line!)).toBe(true);
    expect(boqQuantityDisplay(line!)).toBe('—');
    expect(isQuantityIdentityLine(line!)).toBe(false);
    expect(takeoffBoqApprovalBlocked(boq)).toBe(true);
  });

  it('does not auto-approve earthing weld occurrences as electrical accessory quantity', () => {
    const base = Array.from({ length: 163 }, (_, i) =>
      workerDet({
        id: `w${i}`,
        sheetKey: 'p1',
        typeKey: null,
        classifiedBy: 'none',
        confidence: 'none',
        signature: 'block:WP',
        rawClass: 'wp',
        legendRowIds: ['row:wp'],
        reasons: ['unclassified', 'legend_unmapped'],
      }),
    );
    const detections = enrichDetectionsWithLegendIdentity(applyEdits(base, []), [
      legend({
        key: 'row:wp',
        decodedText: 'מבוצעת ע"פ התקן הישראלי. נקודת ריתוך בין 2 מוליכי טבעת הארקת יסוד',
        signature: 'block:WP',
      }),
    ]);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    const line = boq.lines.find((row) => row.originalLabel?.includes('נקודת ריתוך'));
    expect(line?.quantity).toBe(0);
    expect(line?.symbolCount).toBe(163);
    expect(line?.identitySource).toBe('uncertain');
    expect(line?.unit).toBe("יח'");
    expect(boqQuantityDisplay(line!)).toBe('—');
    expect(isQuantityIdentityLine(line!)).toBe(false);
    expect(takeoffBoqApprovalBlocked(boq)).toBe(true);
    expect(detections.every((row) => row.needsReview)).toBe(true);
  });

  it('leaves a conflicting 36e group in review and does not invent a quantity name', () => {
    const base = [
      workerDet({
        id: 'c1',
        sheetKey: 'p1',
        typeKey: null,
        classifiedBy: 'none',
        signature: 'block:36e',
        rawClass: '36e',
        legendRowIds: ['row:aaaa', 'row:bbbb'],
        reasons: ['type_ambiguous', 'legend_unmapped'],
        confidence: 'none',
      }),
    ];
    const detections = enrichDetectionsWithLegendIdentity(applyEdits(base, []), [
      legend({ key: 'row:aaaa', decodedText: 'נקודת מאור חירום', signature: 'block:36e' }),
      legend({ key: 'row:bbbb', decodedText: 'תאורה שקועה', signature: 'block:36e' }),
    ]);
    expect(detections[0]?.needsReview).toBe(true);
    expect(buildReviewGroups(detections)).toHaveLength(1);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    expect(boq.unclassifiedCount).toBe(1);
    expect(boq.lines.some((row) => row.identitySource === 'legend')).toBe(false);
  });

  it('renames a legend BOQ line with userLabel and keeps original text, quantity and type', () => {
    const base = Array.from({ length: 4 }, (_, i) =>
      workerDet({
        id: `sw${i}`,
        sheetKey: 'p1',
        typeKey: null,
        classifiedBy: 'none',
        confidence: 'none',
        signature: 'block:14e',
        rawClass: '14e',
        legendRowIds: ['row:switch'],
        reasons: ['unclassified', 'legend_unmapped'],
      }),
    );
    const other = workerDet({
      id: 'cross',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      confidence: 'none',
      signature: 'block:19e',
      rawClass: '19e',
      legendRowIds: ['row:cross'],
      reasons: ['unclassified', 'legend_unmapped'],
    });
    const legendRows: WorkerLegendEntry[] = [
      legend({ key: 'row:switch', decodedText: 'מפסק מאור', signature: 'block:14e' }),
      legend({ key: 'row:cross', decodedText: 'מפסק מאור צלב', signature: 'block:19e' }),
    ];
    const detections = enrichDetectionsWithLegendIdentity(
      applyEdits([...base, other], base.map((row) => ({ op: 'set_label' as const, detectionId: row.id, label: 'מפסק מאור יחיד' }))),
      legendRows,
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
    const renamed = boq.lines.find((row) => row.label === 'מפסק מאור יחיד');
    const untouched = boq.lines.find((row) => row.label === 'מפסק מאור צלב');
    expect(renamed?.quantity).toBe(4);
    expect(renamed?.typeKey).toBeNull();
    expect(renamed?.originalLabel).toBe('מפסק מאור');
    expect(untouched?.quantity).toBe(1);
    expect(untouched?.originalLabel).toBe('מפסק מאור צלב');
    expect(detections.filter((row) => row.id.startsWith('sw')).every((row) => row.originalText === 'מפסק מאור')).toBe(true);
    expect(detections.find((row) => row.id === 'cross')?.userLabel).toBeUndefined();
    expect(detections.find((row) => row.id === 'cross')?.status).toBe('suggested');
  });

  it('drops an explicit user exclude from BOQ lines, summaries and review without deleting the mark', () => {
    const waiting = workerDet({
      id: 'wait',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      confidence: 'none',
      signature: 'block:noise',
      rawClass: 'noise',
      reasons: ['unclassified'],
    });
    const stillWaiting = workerDet({
      id: 'queue',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      confidence: 'none',
      signature: 'block:unknown',
      rawClass: 'unknown',
      reasons: ['unclassified'],
    });
    const counted = workerDet({
      id: 'keep',
      sheetKey: 'p1',
      typeKey: null,
      classifiedBy: 'none',
      confidence: 'none',
      signature: 'block:stair',
      rawClass: 'stair',
      legendRowIds: ['row:1'],
      reasons: ['unclassified', 'legend_unmapped'],
    });
    const detections = enrichDetectionsWithLegendIdentity(
      applyEdits([waiting, stillWaiting, counted], [{ op: 'set_boq_excluded', detectionId: 'wait', excluded: true }]),
      [legend({ key: 'row:1', decodedText: 'לחצן חדר מדרגות' })],
    );
    const excluded = detections.find((row) => row.id === 'wait');
    expect(excluded).toMatchObject({ reasons: ['user_excluded'], needsReview: false });
    expect(excluded?.x).toBe(100);
    const boq = computeBoq({
      detections,
      sheets: [sheetDto({ sheetKey: 'p1' })],
      areas: [],
      catalog,
      ruleSet: DEFAULT_RULE_SET,
      linear: [],
      state: 'draft',
    });
    expect(boq.lines.some((row) => row.detectionIds.includes('wait'))).toBe(false);
    expect(boq.lines.find((row) => row.originalLabel === 'לחצן חדר מדרגות')?.quantity).toBe(1);
    expect(boq.unclassifiedCount).toBe(1);
    expect(boq.needsReviewCount).toBe(1);
    expect(buildReviewGroups(detections).flatMap((group) => group.detectionIds)).toEqual(['queue']);
  });
});
