import { describe, expect, it } from 'vitest';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import {
  buildExcludeFromBoqEdits,
  buildRestoreToBoqEdits,
  buildSaveReviewEdits,
  nextUnconfirmedId,
  resolveExcludeFromBoqIds,
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

  it('does not auto-include other identities when the selected mark has a legend conflict', () => {
    const selected = detection({
      id: 'sel',
      typeKey: null,
      reasons: ['type_ambiguous'],
      legendRowIds: ['a', 'b'],
      legendUnambiguous: false,
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
    expect(plan.requestedCount).toBe(2);
    expect(plan.skippedConflict).toBe(1);
  });

  it('confirms all 68 identical lighting-switch marks that only have catalog-family ambiguity', () => {
    const marks = Array.from({ length: 68 }, (_, index) => {
      const sheet = index < 7 ? 'layout:F0' : index < 20 ? 'layout:F1' : 'layout:F2-5';
      return detection({
        id: `${sheet}#14e-${index + 1}`,
        sheetKey: sheet,
        typeKey: 'control.switch.single',
        originalText: 'מפסק מאור',
        legendRowIds: ['row:fce0d938b617f15e'],
        signature: 'block:14e',
        rawClass: 'block:14e',
        reasons: ['type_ambiguous'],
        needsReview: true,
      });
    });
    const plan = resolveSaveReviewPlan({
      selected: marks[0]!,
      detections: marks,
      applyToGroup: true,
      typeKey: 'control.switch.single',
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.includedCount).toBe(68);
    expect(plan.skippedCount).toBe(0);
    expect(plan.inseparableConflict).toBe(false);
    expect(buildSaveReviewEdits(plan, marks)).toEqual([
      { op: 'confirm', detectionIds: marks.map((item) => item.id) },
    ]);
  });

  it('confirms the safe identical subgroup and leaves real legend conflicts for a separate check', () => {
    const safe = Array.from({ length: 60 }, (_, index) =>
      detection({
        id: `ok-${index + 1}`,
        typeKey: 'control.switch.single',
        originalText: 'מפסק מאור',
        legendRowIds: ['row:light'],
        signature: 'block:14e',
        rawClass: 'block:14e',
        reasons: ['type_ambiguous'],
        needsReview: true,
      }),
    );
    const blocked = Array.from({ length: 8 }, (_, index) =>
      detection({
        id: `conflict-${index + 1}`,
        typeKey: 'control.switch.single',
        originalText: 'מפסק מאור',
        legendRowIds: ['row:light', 'row:cross'],
        legendUnambiguous: false,
        signature: 'block:14e',
        rawClass: 'block:14e',
        reasons: ['type_ambiguous'],
        needsReview: true,
      }),
    );
    const plan = resolveSaveReviewPlan({
      selected: safe[0]!,
      detections: [...safe, ...blocked],
      applyToGroup: true,
      typeKey: 'control.switch.single',
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.includedCount).toBe(60);
    expect(plan.skippedConflict).toBe(8);
    expect(plan.ids).toEqual(safe.map((item) => item.id));
    expect(buildSaveReviewEdits(plan, [...safe, ...blocked])).toEqual([
      { op: 'confirm', detectionIds: safe.map((item) => item.id) },
    ]);
  });

  it('keeps an inseparable same-sheet legend conflict blocked until an explicit manual group confirm', () => {
    const marks = Array.from({ length: 8 }, (_, index) =>
      detection({
        id: `p1#36e-${index + 1}`,
        sheetKey: 'layout:F1',
        typeKey: null,
        originalText: 'תיאור א',
        legendRowIds: ['row:a', 'row:b'],
        legendUnambiguous: false,
        signature: 'block:36e',
        rawClass: 'block:36e',
        reasons: ['type_ambiguous'],
        needsReview: true,
      }),
    );
    const auto = resolveSaveReviewPlan({
      selected: marks[0]!,
      detections: marks,
      applyToGroup: true,
      typeKey: 'control.switch.single',
      confirm: true,
      saveToLibrary: false,
    });
    expect(auto.ids).toEqual([marks[0]!.id]);
    expect(auto.inseparableConflict).toBe(true);
    expect(auto.skippedConflict).toBe(7);

    const manual = resolveSaveReviewPlan({
      selected: marks[0]!,
      detections: marks,
      applyToGroup: true,
      typeKey: 'control.switch.single',
      confirm: true,
      saveToLibrary: false,
      explicitGroupConfirm: true,
    });
    expect(manual.includedCount).toBe(8);
    expect(manual.inseparableConflict).toBe(false);
    expect(manual.ids).toEqual(marks.map((item) => item.id));
  });

  it('does not let an explicit confirm change a different symbol group', () => {
    const selected = detection({
      id: 'sw-1',
      originalText: 'מפסק מאור',
      legendRowIds: ['row:light'],
      signature: 'block:14e',
      rawClass: 'block:14e',
      reasons: ['type_ambiguous'],
    });
    const other = detection({
      id: 'cross-1',
      originalText: 'מפסק מאור צלב',
      legendRowIds: ['row:cross'],
      signature: 'block:19e',
      rawClass: 'block:19e',
      reasons: ['type_ambiguous'],
    });
    const plan = resolveSaveReviewPlan({
      selected,
      detections: [selected, other],
      applyToGroup: true,
      typeKey: 'control.switch.single',
      confirm: true,
      saveToLibrary: false,
      explicitGroupConfirm: true,
    });
    expect(plan.ids).toEqual(['sw-1']);
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

  it('confirms rotated copies of the same unique accessory in one group action', () => {
    const named = detection({
      id: 'named',
      originalText: 'מפסק מאור',
      legendRowIds: ['row:light'],
      signature: 'block:14e',
      rawClass: 'block:14e',
      reasons: ['unclassified'],
    });
    const rotated = Array.from({ length: 11 }, (_, index) =>
      detection({
        id: `rot-${index + 1}`,
        originalText: 'מפסק מאור',
        legendRowIds: ['row:light'],
        signature: `block:*geom:sw${index + 1}`,
        rawClass: `*U${index + 1}`,
        reasons: ['unclassified', 'dynamic_block_unresolved'],
      }),
    );
    const plan = resolveSaveReviewPlan({
      selected: named,
      detections: [named, ...rotated],
      applyToGroup: true,
      typeKey: null,
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.includedCount).toBe(12);
    expect(plan.skippedCount).toBe(0);
  });

  it('does not group-confirm a cross switch with a lighting switch', () => {
    const single = detection({
      id: 'single',
      originalText: 'מפסק מאור',
      legendRowIds: ['row:light'],
      signature: 'block:14e',
    });
    const cross = detection({
      id: 'cross',
      originalText: 'מפסק מאור צלב',
      legendRowIds: ['row:cross'],
      signature: 'block:19e',
    });
    const plan = resolveSaveReviewPlan({
      selected: single,
      detections: [single, cross],
      applyToGroup: true,
      typeKey: null,
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.ids).toEqual(['single']);
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

  it('confirms five shown 3-pole safety-switch names without a catalog type', () => {
    const marks = Array.from({ length: 5 }, (_, index) =>
      detection({
        id: `3p-${index + 1}`,
        typeKey: null,
        originalText: 'מפסק בטחון 3-קוטבי',
        legendUnambiguous: false,
        identitySource: 'uncertain',
        legendRowIds: ['row:3p'],
        signature: 'block:3pol',
        rawClass: 'block:3pol',
        reasons: ['unclassified', 'type_ambiguous'],
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
    expect(plan.includedCount).toBe(5);
    expect(plan.skippedCount).toBe(0);
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
    expect(plan.skippedCount).toBe(1);
    expect(buildSaveReviewEdits(plan, [named, unnamed])).toEqual([
      { op: 'confirm', detectionIds: ['named'] },
    ]);
  });

  it('does not ask to re-approve marks that are already confirmed', () => {
    const selected = detection({ id: 'open' });
    const done = Array.from({ length: 84 }, (_, index) =>
      detection({
        id: `done-${index + 1}`,
        status: 'confirmed',
        needsReview: false,
        reasons: [],
      }),
    );
    const plan = resolveSaveReviewPlan({
      selected,
      detections: [selected, ...done],
      applyToGroup: true,
      typeKey: null,
      confirm: true,
      saveToLibrary: false,
    });
    expect(plan.includedCount).toBe(1);
    expect(plan.ids).toEqual(['open']);
    expect(plan.skippedCount).toBe(0);
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

describe('resolveExcludeFromBoqIds', () => {
  it('excludes only the selected mark unless the group was chosen', () => {
    const selected = detection({ id: 'a', originalText: 'שקע' });
    const mate = detection({ id: 'b', originalText: 'שקע' });
    const other = detection({ id: 'c', originalText: 'מפסק מאור', signature: 'block:other' });
    expect(
      resolveExcludeFromBoqIds({
        selected,
        detections: [selected, mate, other],
        applyToGroup: false,
      }),
    ).toEqual(['a']);
    expect(
      resolveExcludeFromBoqIds({
        selected,
        detections: [selected, mate, other],
        applyToGroup: true,
      }),
    ).toEqual(['a', 'b']);
  });

  it('does not overwrite a confirmed sibling that was not selected', () => {
    const selected = detection({ id: 'open', originalText: 'שקע' });
    const done = detection({
      id: 'done',
      originalText: 'שקע',
      status: 'confirmed',
      needsReview: false,
      reasons: [],
    });
    expect(
      resolveExcludeFromBoqIds({
        selected,
        detections: [selected, done],
        applyToGroup: true,
      }),
    ).toEqual(['open']);
  });

  it('builds persistable exclude edits for the chosen ids', () => {
    expect(buildExcludeFromBoqEdits(['a', 'b'])).toEqual([
      { op: 'set_boq_excluded', detectionId: 'a', excluded: true },
      { op: 'set_boq_excluded', detectionId: 'b', excluded: true },
    ]);
  });
});

describe('buildRestoreToBoqEdits', () => {
  it('clears the exclude without deleting the mark', () => {
    expect(buildRestoreToBoqEdits(['a'])).toEqual([{ op: 'set_boq_excluded', detectionId: 'a', excluded: false }]);
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
