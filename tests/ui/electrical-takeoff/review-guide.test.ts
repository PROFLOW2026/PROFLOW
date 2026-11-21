import { describe, expect, it } from 'vitest';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';
import {
  buildReviewGroups,
  defaultReviewScope,
  reviewKind,
  reviewProgress,
  symbolCropSource,
  symbolIdentityLabel,
  typeSuggestions,
} from '@/modules/electrical-takeoff/ui/review-guide';
import { occurrenceFocusRect } from '@/modules/electrical-takeoff/ui/viewer/viewer-math';

function mark(partial: Partial<EffectiveDetection> & Pick<EffectiveDetection, 'id'>): EffectiveDetection {
  return {
    sheetKey: 's',
    x: 10,
    y: 10,
    w: 12,
    h: 12,
    typeKey: null,
    origin: 'auto',
    status: 'suggested',
    confidence: 'none',
    reasons: ['unclassified'],
    rawClass: 'BLOCK_A',
    tagText: null,
    signature: 'sig-a',
    source: 'dwg',
    areaId: null,
    needsReview: true,
    ...partial,
  };
}

describe('guided review groups', () => {
  it('keeps identical occurrences together and leaves a different type outside the group', () => {
    const groups = buildReviewGroups([
      mark({ id: '1' }),
      mark({ id: '2' }),
      mark({
        id: '3',
        typeKey: 'light.recessed',
        confidence: 'low',
        reasons: ['low_confidence'],
      }),
    ]);
    const missing = groups.find((group) => group.kind === 'missingType');
    const confirm = groups.find((group) => group.kind === 'confirmType');
    expect(missing?.detectionIds).toEqual(['1', '2']);
    expect(confirm?.detectionIds).toEqual(['3']);
    expect(reviewKind(mark({ id: '9', typeKey: 'light.recessed', confidence: 'low', reasons: ['type_ambiguous'] }))).toBe(
      'uncertain',
    );
    expect(
      reviewKind(
        mark({
          id: 'legend-1',
          typeKey: null,
          originalText: 'נקודת מאור',
          legendUnambiguous: true,
          identitySource: 'legend',
          reasons: [],
        }),
      ),
    ).toBe('confirmType');
  });

  it('splits a same-block cluster into a safe subgroup and a real legend-conflict subgroup', () => {
    const safe = Array.from({ length: 60 }, (_, index) =>
      mark({
        id: `ok-${index + 1}`,
        typeKey: 'control.switch.single',
        originalText: 'מפסק מאור',
        legendRowIds: ['row:light'],
        signature: 'block:14e',
        rawClass: 'block:14e',
        reasons: ['type_ambiguous'],
        confidence: 'low',
      }),
    );
    const blocked = Array.from({ length: 8 }, (_, index) =>
      mark({
        id: `conflict-${index + 1}`,
        typeKey: 'control.switch.single',
        originalText: 'מפסק מאור',
        legendRowIds: ['row:light', 'row:cross'],
        legendUnambiguous: false,
        signature: 'block:14e',
        rawClass: 'block:14e',
        reasons: ['type_ambiguous'],
        confidence: 'low',
      }),
    );
    const groups = buildReviewGroups([...safe, ...blocked]);
    const safeGroup = groups.find((group) => group.detectionIds.includes('ok-1'));
    const conflictGroup = groups.find((group) => group.detectionIds.includes('conflict-1'));
    expect(safeGroup?.occurrences).toBe(60);
    expect(conflictGroup?.occurrences).toBe(8);
    expect(safeGroup?.key).not.toBe(conflictGroup?.key);
  });

  it('defaults bulk apply only when the group has no type conflict', () => {
    expect(
      defaultReviewScope({
        kind: 'missingType',
        occurrences: 8,
        reasons: ['unclassified'],
      }),
    ).toBe('group');
    expect(
      defaultReviewScope({
        kind: 'missingType',
        occurrences: 8,
        reasons: ['unclassified', 'type_ambiguous'],
      }),
    ).toBe('group');
    expect(
      defaultReviewScope({
        kind: 'uncertain',
        occurrences: 8,
        reasons: ['type_ambiguous'],
      }),
    ).toBe('group');
    expect(
      defaultReviewScope({
        kind: 'uncertain',
        occurrences: 8,
        reasons: ['pdf_dwg_mismatch'],
      }),
    ).toBe('one');
    expect(
      defaultReviewScope({
        kind: 'confirmType',
        occurrences: 3,
        reasons: ['low_confidence'],
      }),
    ).toBe('group');
    expect(defaultReviewScope({ kind: 'missingType', occurrences: 1, reasons: ['unclassified'] })).toBe('one');
  });

  it('suggests only a type that already exists on the library signature or the same symbol', () => {
    const focus = mark({ id: '1' });
    const catalog = new Set(['power.socket.single', 'light.recessed', 'control.switch']);
    expect(
      typeSuggestions(focus, [focus], [{ signature: 'sig-a', typeKey: 'power.socket.single' }], catalog),
    ).toEqual([{ typeKey: 'power.socket.single', source: 'library' }]);

    const typed = mark({ id: '2', typeKey: 'light.recessed', confidence: 'high', reasons: [], needsReview: false });
    expect(typeSuggestions(focus, [focus, typed], [], catalog)).toEqual([
      { typeKey: 'light.recessed', source: 'sameSymbol' },
    ]);

    const other = mark({ id: '3', typeKey: 'control.switch', confidence: 'high', reasons: [], needsReview: false });
    expect(typeSuggestions(focus, [focus, typed, other], [], catalog)).toEqual([]);
    expect(typeSuggestions(focus, [focus], [{ signature: 'other', typeKey: 'power.socket.single' }], catalog)).toEqual([]);
  });

  it('reads a stored block name and ignores a technical id', () => {
    expect(symbolIdentityLabel(mark({ id: '1', rawClass: '3-14' }))).toEqual({ kind: 'block', value: '3-14' });
    expect(symbolIdentityLabel(mark({ id: '1', rawClass: 'L7' }))).toEqual({ kind: 'legend', value: 'L7' });
    expect(symbolIdentityLabel(mark({ id: '1', rawClass: 'l39', signature: 'block:l39' }))).toEqual({
      kind: 'block',
      value: 'l39',
    });
    expect(symbolIdentityLabel(mark({ id: '1', rawClass: 'p1#4' }))).toBeNull();
  });

  it('frames one real DWG block, including an l39-sized insert, instead of the whole sheet', () => {
    const { view, workerBase } = getReal7155Fixture();
    const sheet = view.sheets.find((item) => item.sheetKey === 'layout:תאורה ג' && item.fileId === 'dwg');
    const marks = workerBase.filter((item) => item.fileId === 'dwg' && item.sheetKey === 'layout:תאורה ג' && item.rawClass === 'T1');
    expect(sheet).toBeTruthy();
    expect(marks.length).toBeGreaterThan(40);
    const sample = marks[0];
    if (!sheet || !sample) throw new Error('missing real DWG mark');
    const crop = symbolCropSource(sample, sheet, { width: sheet.widthPx, height: sheet.heightPx });
    expect(crop.sx + crop.sw / 2).toBeCloseTo(sample.x, 3);
    expect(crop.sy + crop.sh / 2).toBeCloseTo(sample.y, 3);
    const spread = Math.max(...marks.map((item) => item.x)) - Math.min(...marks.map((item) => item.x));
    const focus = occurrenceFocusRect(sample);
    expect(focus.x).toBe(sample.x);
    expect(focus.y).toBe(sample.y);
    expect(focus.width).toBeLessThan(sheet.widthPx);
    expect(focus.width).toBeLessThan(spread || sheet.widthPx);
    expect(crop.sw).toBeLessThan(sheet.widthPx);

    const l39 = mark({
      id: 'l39-1',
      rawClass: 'l39',
      signature: 'block:l39',
      x: 1400,
      y: 900,
      w: 12,
      h: 12,
    });
    const l39Sheet = { widthPx: 7000, heightPx: 4200 };
    const l39Image = { width: 400, height: 689 };
    const l39Crop = symbolCropSource(l39, l39Sheet, l39Image);
    const l39Focus = occurrenceFocusRect(l39);
    const sheetWidth = l39Crop.sw / (l39Image.width / l39Sheet.widthPx);
    const sheetHeight = l39Crop.sh / (l39Image.height / l39Sheet.heightPx);
    expect(symbolIdentityLabel(l39)).toEqual({ kind: 'block', value: 'l39' });
    expect(l39Crop.sx + l39Crop.sw / 2).toBeCloseTo(l39.x * (l39Image.width / l39Sheet.widthPx), 3);
    expect(l39Crop.sy + l39Crop.sh / 2).toBeCloseTo(l39.y * (l39Image.height / l39Sheet.heightPx), 3);
    expect(sheetWidth).toBeCloseTo(sheetHeight, 3);
    expect(sheetWidth).toBeCloseTo(l39Focus.width, 3);
    expect(l39Focus.width).toBeLessThan(l39Sheet.widthPx * 0.05);
    const context = symbolCropSource(l39, l39Sheet, l39Image, 'context');
    const thumb = symbolCropSource(l39, l39Sheet, l39Image, 'thumb');
    expect(thumb.sw).toBeLessThan(l39Crop.sw);
    expect(l39Crop.sw).toBeLessThan(context.sw);
  });

  it('counts a group as checked only after it leaves the queue', () => {
    const seen = new Set(['missingType::::signature:sig-a']);
    expect(reviewProgress(seen, [{ key: 'missingType::::signature:sig-a' }])).toEqual({ checked: 0, total: 1 });
    expect(reviewProgress(seen, [])).toEqual({ checked: 1, total: 1 });
  });
});
