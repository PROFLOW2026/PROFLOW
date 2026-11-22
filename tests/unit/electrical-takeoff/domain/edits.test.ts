import { describe, expect, it } from 'vitest';

import { applyEdits, deriveNeedsReview } from '@/modules/electrical-takeoff/domain/edits';
import { workerDet } from './fixtures';

describe('applyEdits', () => {
  const base = [workerDet({ id: 'd1', sheetKey: 'p1' }), workerDet({ id: 'd2', sheetKey: 'p1', typeKey: null, confidence: 'none', reasons: ['unclassified'] })];

  it('is idempotent when replayed', () => {
    const edits = [
      { op: 'reclassify' as const, detectionId: 'd2', typeKey: 'fire.smoke_detector', saveToLibrary: false },
      { op: 'confirm' as const, detectionIds: ['d2'] },
    ];
    const once = applyEdits(base, edits);
    const twice = applyEdits(base, [...edits, ...edits]);
    expect(twice.find((d) => d.id === 'd2')?.status).toBe('confirmed');
    expect(once.find((d) => d.id === 'd2')?.needsReview).toBe(false);
  });

  it('does not hold an unambiguous legend match only because the anonymous block was unresolved', () => {
    expect(
      deriveNeedsReview({
        reasons: ['unclassified', 'dynamic_block_unresolved'],
        confidence: 'none',
        typeKey: null,
        status: 'suggested',
        userChangedType: false,
        legendUnambiguous: true,
      }),
    ).toBe(false);
  });

  it('confirm clears needsReview', () => {
    const out = applyEdits(base, [{ op: 'confirm', detectionIds: ['d2'] }]);
    expect(out.find((d) => d.id === 'd2')?.needsReview).toBe(false);
  });

  it('maps tempId for user add', () => {
    const out = applyEdits(base, [{ op: 'add', tempId: 'user-1', sheetKey: 'p1', x: 10, y: 10, typeKey: 'comm.data' }]);
    expect(out.some((d) => d.id === 'user-1' && d.origin === 'user_added')).toBe(true);
  });

  it('adds a visible mark without inventing a type', () => {
    const out = applyEdits(base, [{ op: 'add', tempId: 'user-2', sheetKey: 'p1', x: 4, y: 8, typeKey: null }]);
    const added = out.find((d) => d.id === 'user-2');
    expect(added?.typeKey).toBeNull();
    expect(added?.needsReview).toBe(true);
    expect(added?.w).toBe(18);
    expect(added?.h).toBe(18);
  });

  it('confirms a legend name without requiring a catalog type', () => {
    const out = applyEdits(base, [{ op: 'confirm', detectionIds: ['d2'] }]);
    const row = out.find((d) => d.id === 'd2');
    expect(row?.typeKey).toBeNull();
    expect(row?.status).toBe('confirmed');
    expect(row?.needsReview).toBe(false);
  });

  it('keeps a stored confirmation when a later reclassify only fills the type', () => {
    const out = applyEdits(base, [
      { op: 'confirm', detectionIds: ['d2'] },
      { op: 'reclassify', detectionId: 'd2', typeKey: 'light.point', saveToLibrary: false },
    ]);
    const row = out.find((d) => d.id === 'd2');
    expect(row?.typeKey).toBe('light.point');
    expect(row?.status).toBe('confirmed');
    expect(row?.needsReview).toBe(false);
  });

  it('renames and reassigns a legend row, then keeps the decision on replay', () => {
    const edits = [
      { op: 'set_label' as const, detectionId: 'd2', label: 'שקע יחיד' },
      { op: 'assign_legend' as const, detectionId: 'd2', legendRowId: 'L-socket' },
      { op: 'confirm' as const, detectionIds: ['d2'] },
    ];
    const once = applyEdits(base, edits);
    const again = applyEdits(base, edits);
    expect(once.find((d) => d.id === 'd2')).toMatchObject({
      userLabel: 'שקע יחיד',
      legendRowIds: ['L-socket'],
      status: 'confirmed',
    });
    expect(again.find((d) => d.id === 'd2')?.userLabel).toBe('שקע יחיד');
  });

  it('stores userLabel without changing type, status, origin or other marks', () => {
    const confirmed = applyEdits(base, [{ op: 'confirm', detectionIds: ['d2'] }]);
    const out = applyEdits(base, [
      { op: 'confirm', detectionIds: ['d2'] },
      { op: 'set_label', detectionId: 'd2', label: 'שקע יחיד מואר' },
    ]);
    const renamed = out.find((row) => row.id === 'd2');
    const other = out.find((row) => row.id === 'd1');
    const before = confirmed.find((row) => row.id === 'd2');
    expect(renamed).toMatchObject({
      userLabel: 'שקע יחיד מואר',
      typeKey: before?.typeKey,
      status: 'confirmed',
      origin: 'auto',
      needsReview: false,
    });
    expect(other?.userLabel).toBeUndefined();
    expect(other?.typeKey).toBe('power.socket.single');
    expect(other?.status).toBe('suggested');
  });

  it('keeps an excluded mark on the plan and out of review after replay', () => {
    const edits = [{ op: 'set_boq_excluded' as const, detectionId: 'd2', excluded: true }];
    const once = applyEdits(base, edits);
    const again = applyEdits(base, edits);
    const row = once.find((item) => item.id === 'd2');
    expect(row).toMatchObject({
      id: 'd2',
      reasons: ['user_excluded'],
      needsReview: false,
      typeKey: null,
    });
    expect(row?.x).toBe(100);
    expect(again.find((item) => item.id === 'd2')?.reasons).toEqual(['user_excluded']);
    expect(once.find((item) => item.id === 'd1')?.reasons).toEqual([]);
  });

  it('does not treat waiting unclassified the same as an explicit exclude', () => {
    expect(
      deriveNeedsReview({
        reasons: ['unclassified'],
        confidence: 'none',
        typeKey: null,
        status: 'suggested',
        userChangedType: false,
      }),
    ).toBe(true);
    expect(
      deriveNeedsReview({
        reasons: ['user_excluded'],
        confidence: 'none',
        typeKey: null,
        status: 'suggested',
        userChangedType: false,
      }),
    ).toBe(false);
  });

  it('clears an exclude when the mark is reclassified to a real type', () => {
    const out = applyEdits(base, [
      { op: 'set_boq_excluded', detectionId: 'd2', excluded: true },
      { op: 'reclassify', detectionId: 'd2', typeKey: 'light.point', saveToLibrary: false },
    ]);
    const row = out.find((item) => item.id === 'd2');
    expect(row?.reasons.includes('user_excluded')).toBe(false);
    expect(row?.typeKey).toBe('light.point');
  });
});