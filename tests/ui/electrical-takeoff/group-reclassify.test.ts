import { describe, expect, it } from 'vitest';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import { buildGroupReclassifyEdits } from '@/modules/electrical-takeoff/ui/takeoff-analysis-view';

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
    rawClass: 'L7',
    tagText: null,
    signature: 'shape:inst',
    source: 'pdf',
    areaId: null,
    needsReview: true,
    ...patch,
  };
}

describe('group reclassify library payload', () => {
  it('saves every signed plan mark and skips a hand mark in the same legend group', () => {
    const plan = detection({ id: 'p1#1', signature: 'shape:a' });
    const twin = detection({ id: 'p2#4', signature: 'shape:b', source: 'dwg' });
    const hand = detection({ id: 'user-1', signature: null, source: 'manual', rawClass: 'manual' });
    const unsigned = detection({ id: 'p1#9', signature: null });
    const edits = buildGroupReclassifyEdits(
      [plan.id, twin.id, hand.id, unsigned.id],
      [plan, twin, hand, unsigned],
      'control.switch',
      true,
    );
    expect(edits).toEqual([
      { op: 'reclassify', detectionId: 'p1#1', typeKey: 'control.switch', saveToLibrary: true },
      { op: 'reclassify', detectionId: 'p2#4', typeKey: 'control.switch', saveToLibrary: true },
      { op: 'reclassify', detectionId: 'user-1', typeKey: 'control.switch', saveToLibrary: false },
      { op: 'reclassify', detectionId: 'p1#9', typeKey: 'control.switch', saveToLibrary: false },
    ]);
  });

  it('does not save when the user left the library box off', () => {
    const plan = detection({ id: 'p1#1' });
    const edits = buildGroupReclassifyEdits([plan.id], [plan], 'control.switch', false);
    expect(edits[0]).toMatchObject({ saveToLibrary: false, typeKey: 'control.switch' });
  });
});
