import { describe, expect, it } from 'vitest';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import {
  buildReviewGroups,
  reviewKind,
  reviewProgress,
  symbolIdentityLabel,
  typeSuggestions,
} from '@/modules/electrical-takeoff/ui/review-guide';

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
    expect(symbolIdentityLabel(mark({ id: '1', rawClass: 'p1#4' }))).toBeNull();
  });

  it('counts a group as checked only after it leaves the queue', () => {
    const seen = new Set(['missingType::::signature:sig-a']);
    expect(reviewProgress(seen, [{ key: 'missingType::::signature:sig-a' }])).toEqual({ checked: 0, total: 1 });
    expect(reviewProgress(seen, [])).toEqual({ checked: 1, total: 1 });
  });
});
