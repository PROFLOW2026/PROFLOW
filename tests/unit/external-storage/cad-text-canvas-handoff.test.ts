import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shouldDrawTextOnCanvas } from '@/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy';
import { applyCadP8GpuTextHandoff } from '@/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff';
import { appendShxGpuSegments } from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import { clearCadShxFonts, registerCadShxFonts } from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

beforeEach(() => {
  clearCadShxFonts();
});

afterEach(() => {
  clearCadShxFonts();
});

describe('cad text canvas handoff regression', () => {
  it('does not mark SHX texts gpu without a loaded SHX font (Canvas fallback)', () => {
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

  it('Hebrew SHX can skip Canvas when bigfont provides every glyph', () => {
    clearCadShxFonts();
    const primary = new Uint8Array(48);
    primary.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    primary.set([0x1a, 0, 66, 3, 1, 16, 14], 24);

    const big = new Uint8Array(80);
    big.set(new TextEncoder().encode('AutoCAD-86 bigfont 1.0'), 0);
    const heYod = 0x05d9;
    big.set([0x1a, heYod & 0xff, (heYod >> 8) & 0xff, 65, 0, 0, 0, 65, 3, 1, 16, 14], 28);

    registerCadShxFonts([
      { name: 'miryl.shx', bytes: primary },
      { name: 'mirylb.shx', bytes: big },
    ]);

    const texts: CadText[] = [
      {
        k: 'text',
        t: 'י',
        x: 10,
        y: 20,
        h: 2.5,
        r: 0,
        c: 0xff00ff00,
        layer: 0,
        style: 'mirylb.shx',
      },
    ];
    const segments = new Float32Array([0, 0, 1, 1, 0, 0, 0, 0]);
    const handoff = applyCadP8GpuTextHandoff(segments, {
      texts,
      origin: [0, 0],
      gpuTexts: 0,
      segmentStride: 8,
    } as never);

    expect(handoff.scene.texts[0]?.gpu).toBe(true);
    expect(handoff.scene.gpuTexts).toBe(1);
    expect(handoff.segments.length).toBeGreaterThan(segments.length);
    expect(shouldDrawTextOnCanvas(handoff.scene.texts[0]!)).toBe(false);
    clearCadShxFonts();
  });
});
