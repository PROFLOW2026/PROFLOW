import { describe, expect, it } from 'vitest';

import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
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

  it('confirm clears needsReview', () => {
    const out = applyEdits(base, [{ op: 'confirm', detectionIds: ['d2'] }]);
    expect(out.find((d) => d.id === 'd2')?.needsReview).toBe(false);
  });

  it('maps tempId for user add', () => {
    const out = applyEdits(base, [{ op: 'add', tempId: 'user-1', sheetKey: 'p1', x: 10, y: 10, typeKey: 'comm.data' }]);
    expect(out.some((d) => d.id === 'user-1' && d.origin === 'user_added')).toBe(true);
  });
});