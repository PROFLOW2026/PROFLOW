import { describe, expect, it } from 'vitest';
import { appendShxGpuSegments } from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

describe('cad text canvas handoff regression', () => {
  it('does not mark SHX texts gpu or mutate segment buffer while handoff is disabled', () => {
    const texts: CadText[] = [
      {
        k: 'text',
        t: 'ABC',
        x: 0,
        y: 0,
        h: 2.5,
        layer: 0,
        c: 0xff000000,
        style: 'simplex.shx',
      },
    ];
    const segments = new Float32Array([0, 0, 1, 1, 0, 0, 0, 0]);
    const scene = { texts, gpuTexts: 0, segmentStride: 8 as const };
    const out = appendShxGpuSegments(segments, scene, [0, 0]);
    expect(out.shxGpuCount).toBe(0);
    expect(out.segments).toBe(segments);
    expect(out.scene.texts[0]?.gpu).toBeUndefined();
    expect(out.scene.gpuTexts).toBe(0);
  });
});
