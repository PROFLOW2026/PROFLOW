import { describe, expect, it } from 'vitest';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import {
  buildSaveReviewEdits,
  nextUnconfirmedId,
  resolveSaveReviewPlan,
} from '@/modules/electrical-takeoff/ui/save-review-action';

function detection(patch: Partial<EffectiveDetection> & Pick<EffectiveDetection, 'id'>): EffectiveDetection {
  return {
    sheetKey: 'p1',
    x: 0,
    y: 0,
    w: 8,
    h: 8,
    typeKey: null,
    origin: 'auto',
    status: 'suggested',
    confidence: 'none',
    reasons: ['unclassified'],
    rawClass: 'block:111e',
    tagText: null,
    signature: 'block:111e',
    source: 'dwg',
    areaId: null,
    needsReview: true,
    ...patch,
  };
}

describe('resolveSaveReviewPlan', () => {
  it('includes every identical lighting-point mark in a group confirm', () => {
    const marks = Array.from({ length: 85 }, (_, index) =>
      detection({
        id: `p1#${index + 1}`,
        typeKey: 'light.point',
        reasons: [],
        needsReview: true,
      }),
    );
    const plan = resolveSaveReviewPlan({
      selected: marks[0]!,
      detections: marks,
      applyToGroup: true,
      typeKey: 'light.point',
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.includedCount).toBe(85);
    expect(plan.skippedCount).toBe(0);
    expect(buildSaveReviewEdits(plan, marks)).toEqual([
      { op: 'confirm', detectionIds: marks.map((item) => item.id) },
    ]);
  });

  it('does not confirm a conflicting or uncertain mate just because it shares a block', () => {
    const selected = detection({ id: 'ok', typeKey: 'light.point', reasons: [], needsReview: true });
    const conflict = detection({
      id: 'conflict',
      typeKey: null,
      reasons: ['type_ambiguous'],
      legendRowIds: ['a', 'b'],
      needsReview: true,
    });
    const uncertain = detection({
      id: 'uncertain',
      typeKey: 'light.point',
      reasons: ['pdf_dwg_mismatch'],
      needsReview: true,
    });
    const otherType = detection({
      id: 'other',
      typeKey: 'light.emergency',
      reasons: [],
      needsReview: true,
    });
    const plan = resolveSaveReviewPlan({
      selected,
      detections: [selected, conflict, uncertain, otherType],
      applyToGroup: true,
      typeKey: 'light.point',
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.ids).toEqual(['ok']);
    expect(plan.skippedConflict).toBe(2);
    expect(plan.skippedUncertain).toBe(1);
  });

  it('forces one occurrence when the selected mark itself has a legend conflict', () => {
    const selected = detection({
      id: 'sel',
      typeKey: null,
      reasons: ['type_ambiguous'],
      legendRowIds: ['a', 'b'],
    });
    const mate = detection({ id: 'mate', typeKey: null, reasons: ['unclassified'] });
    const plan = resolveSaveReviewPlan({
      selected,
      detections: [selected, mate],
      applyToGroup: true,
      typeKey: 'light.point',
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.ids).toEqual(['sel']);
    expect(plan.requestedCount).toBe(1);
  });

  it('still classifies unread legend mates when saving without approval', () => {
    const selected = detection({ id: 'a', typeKey: null, reasons: ['unclassified', 'legend_unmapped'] });
    const mate = detection({
      id: 'b',
      typeKey: null,
      reasons: ['unclassified', 'legend_unmapped'],
      needsReview: true,
    });
    const plan = resolveSaveReviewPlan({
      selected,
      detections: [selected, mate],
      applyToGroup: true,
      typeKey: 'control.switch',
      confirm: false,
      saveToLibrary: false,
    });
    expect(plan.ids).toEqual(['a', 'b']);
    expect(plan.skippedCount).toBe(0);
  });

  it('confirms an unambiguous legend group without inventing a catalog type', () => {
    const marks = Array.from({ length: 85 }, (_, index) =>
      detection({
        id: `p1#${index + 1}`,
        typeKey: null,
        originalText: 'נקודת מאור',
        legendUnambiguous: true,
        identitySource: 'legend',
        reasons: [],
        needsReview: true,
      }),
    );
    const plan = resolveSaveReviewPlan({
      selected: marks[0]!,
      detections: marks,
      applyToGroup: true,
      typeKey: null,
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.includedCount).toBe(85);
    expect(buildSaveReviewEdits(plan, marks)).toEqual([
      { op: 'confirm', detectionIds: marks.map((item) => item.id) },
    ]);
  });

  it('does not confirm unnamed mates when approving a legend name', () => {
    const named = detection({
      id: 'named',
      originalText: 'נקודת מאור',
      legendUnambiguous: true,
      identitySource: 'legend',
      reasons: [],
    });
    const unnamed = detection({ id: 'unnamed', reasons: ['unclassified'] });
    const plan = resolveSaveReviewPlan({
      selected: named,
      detections: [named, unnamed],
      applyToGroup: true,
      typeKey: null,
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.ids).toEqual(['named']);
    expect(plan.skippedUncertain).toBe(1);
    expect(buildSaveReviewEdits(plan, [named, unnamed])).toEqual([
      { op: 'confirm', detectionIds: ['named'] },
    ]);
  });

  it('saves a type without confirming', () => {
    const mark = detection({ id: 'a' });
    const plan = resolveSaveReviewPlan({
      selected: mark,
      detections: [mark],
      applyToGroup: false,
      typeKey: 'light.point',
      confirm: false,
      saveToLibrary: false,
    });
    expect(buildSaveReviewEdits(plan, [mark])).toEqual([
      { op: 'reclassify', detectionId: 'a', typeKey: 'light.point', saveToLibrary: false },
    ]);
  });
});

describe('nextUnconfirmedId', () => {
  it('returns the next unconfirmed mark in the saved group', () => {
    const marks = [
      detection({ id: 'a', status: 'confirmed', reasons: [] }),
      detection({ id: 'b', status: 'suggested', reasons: [] }),
      detection({ id: 'c', status: 'suggested', reasons: [] }),
    ];
    expect(nextUnconfirmedId('a', ['a', 'b', 'c'], marks)).toBe('b');
  });

  it('skips already confirmed mates and wraps to an unconfirmed mark', () => {
    const marks = [
      detection({ id: 'a', status: 'confirmed', reasons: [] }),
      detection({ id: 'b', status: 'confirmed', reasons: [] }),
      detection({ id: 'c', status: 'suggested', reasons: [] }),
    ];
    expect(nextUnconfirmedId('a', ['a', 'b', 'c'], marks)).toBe('c');
  });
});
