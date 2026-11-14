import { describe, expect, it } from 'vitest';

import { isDetectionCountable } from '@/modules/electrical-takeoff/domain/counting-policy';
import { effFromWorker, workerDet } from './fixtures';

describe('counting-policy', () => {
  it('excludes pdf_only until confirmed', () => {
    const d = effFromWorker(workerDet({ id: 'p', sheetKey: 'p1', source: 'pdf' }), {
      reasons: ['pdf_only'],
      status: 'suggested',
    });
    expect(isDetectionCountable(d)).toBe(false);
    const confirmed = { ...d, status: 'confirmed' as const };
    expect(isDetectionCountable(confirmed)).toBe(true);
  });

  it('counts dwg_only and excludes legend_zone', () => {
    const dwgOnly = effFromWorker(workerDet({ id: 'd', sheetKey: 'p1', source: 'dwg' }), { reasons: ['dwg_only'] });
    expect(isDetectionCountable(dwgOnly)).toBe(true);
    const leg = effFromWorker(workerDet({ id: 'z', sheetKey: 'p1' }), { reasons: ['legend_zone'] });
    expect(isDetectionCountable(leg)).toBe(false);
  });
});