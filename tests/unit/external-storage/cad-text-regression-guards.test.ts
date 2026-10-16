import { describe, expect, it } from 'vitest';
import { cadTextCanvasPaint } from '@/modules/external-storage/ui/cad/pf-cad/cad-text-canvas-color';
import { maybeDecodeHebrewShxText } from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';
import { mirrorScale } from '@/modules/external-storage/ui/cad/pf-cad/draw-cad-text';
import {
  mayMarkTextGpu,
  P8_GPU_TEXT_HANDOFF_ENABLED,
  shouldDrawTextOnCanvas,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy';
import { applyCadP8GpuTextHandoff } from '@/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff';
import { appendShxGpuSegments } from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

describe('CAD text regression guards', () => {
  it('packed ARGB opaque yellow is not CSS-transparent', () => {
    const packed = (255 << 24) | 0xffff00;
    const { fillStyle, globalAlpha } = cadTextCanvasPaint(packed, { plotView: true });
    expect(fillStyle).toBe('#ffff00');
    expect(globalAlpha).toBe(1);
    const brokenLegacy = `#${(packed >>> 0).toString(16).padStart(6, '0')}`;
    expect(brokenLegacy).toBe('#ffffff00');
    expect(fillStyle).not.toBe(brokenLegacy);
  });

  it('packed ARGB opaque white uses full opacity on canvas', () => {
    const packed = (255 << 24) | 0xffffff;
    const { fillStyle, globalAlpha } = cadTextCanvasPaint(packed, { plotView: true });
    expect(fillStyle).toBe('#ffffff');
    expect(globalAlpha).toBe(1);
  });

  it('does not apply Hebrew keyboard map to English on non-Hebrew styles', () => {
    expect(maybeDecodeHebrewShxText('ROOM 101', 'ROMANS')).toBe('ROOM 101');
    expect(maybeDecodeHebrewShxText('12.5', 'STANDARD')).toBe('12.5');
  });

  it('mirrorScale treats DWG booleans only (no accidental -1 from 1)', () => {
    expect(mirrorScale(true)).toBe(-1);
    expect(mirrorScale(false)).toBe(1);
    expect(mirrorScale(1)).toBe(1);
  });

  it('gpu-marked Latin records skip Canvas when P8 handoff is enabled', () => {
    expect(
      shouldDrawTextOnCanvas({
        k: 'text',
        t: 'X',
        x: 0,
        y: 0,
        h: 2,
        r: 0,
        c: 0xff000000,
        layer: 0,
        gpu: true,
      }),
    ).toBe(false);
  });

  it('Hebrew SHX without complete bigfont keeps Canvas (strips false gpu)', () => {
    const tx: CadText = {
      k: 'text',
      t: 'שלום',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'simplex.shx',
      gpu: true,
    };
    const out = applyCadP8GpuTextHandoff(new Float32Array(0), {
      texts: [tx],
      origin: [0, 0],
      gpuTexts: 1,
    } as never);
    expect(out.scene.texts[0]?.gpu).toBeUndefined();
    expect(out.scene.gpuTexts).toBe(0);
    expect(shouldDrawTextOnCanvas(out.scene.texts[0]!)).toBe(true);
  });

  it('P8 GPU handoff requires segments for every expected glyph', () => {
    expect(P8_GPU_TEXT_HANDOFF_ENABLED).toBe(true);
    expect(mayMarkTextGpu(0, 10)).toBe(false);
    expect(mayMarkTextGpu(3, 10)).toBe(false);
    expect(mayMarkTextGpu(10, 10)).toBe(true);
    const texts: CadText[] = [
      {
        k: 'text',
        t: 'X',
        x: 0,
        y: 0,
        h: 2,
        r: 0,
        c: 0xff000000,
        layer: 0,
        style: 'simplex.shx',
      },
    ];
    const out = appendShxGpuSegments(new Float32Array(0), { texts }, [0, 0]);
    expect(out.shxGpuCount).toBe(0);
    expect(out.scene.texts[0]?.gpu).toBeUndefined();
  });
});
