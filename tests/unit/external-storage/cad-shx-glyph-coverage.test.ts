import { afterEach, describe, expect, it } from 'vitest';
import { cadTextCanvasPaint } from '@/modules/external-storage/ui/cad/pf-cad/cad-text-canvas-color';
import {
  clearCadShxFonts,
  registerCadShxFonts,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { shouldDrawTextOnCanvas } from '@/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy';
import { mirrorScale } from '@/modules/external-storage/ui/cad/pf-cad/draw-cad-text';
import { colorBitsFromSegmentFloat } from '@/modules/external-storage/ui/cad/pf-cad/renderer/segment-format';
import {
  appendShxGpuSegments,
  appendShxTextSegmentRecords,
  countExpectedShxDrawableGlyphs,
  countShxTextSegments,
  isShxTextRecordGpuComplete,
  sanitizeSceneGpuTextFlags,
  shxTextRecordCoverage,
} from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

function minimalShapesFont(name: string, shapeNum: number, spec: number[]): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  bytes.set([0x1a, 0, shapeNum, spec.length, ...spec], 24);
  return bytes;
}

function registerMinimalFont(name: string): void {
  registerCadShxFonts([{ name, bytes: minimalShapesFont(name, 65, [1, 16, 14]) }]);
}

afterEach(() => {
  clearCadShxFonts();
});

describe('cad-shx-glyph-coverage record completeness', () => {
  it('records expected glyphs vs segment strokes for a loaded SHX font', () => {
    registerMinimalFont('cov.shx');
    const tx: CadText = {
      k: 'text',
      t: 'A',
      x: 10,
      y: 20,
      h: 2.5,
      r: 0,
      c: (255 << 24) | 0xffff00,
      layer: 3,
      style: 'cov.shx',
    };
    const origin: [number, number] = [0, 0];

    expect(countExpectedShxDrawableGlyphs(tx, origin)).toBe(1);
    const coverage = shxTextRecordCoverage(tx, origin);
    expect(coverage).not.toBeNull();
    expect(coverage!.expectedGlyphs).toBe(1);
    expect(coverage!.segmentCount).toBe(countShxTextSegments(tx, origin));
    expect(coverage!.segmentCount).toBeGreaterThanOrEqual(coverage!.expectedGlyphs);
    expect(coverage!.gpuComplete).toBe(true);
    expect(isShxTextRecordGpuComplete(tx, origin)).toBe(true);
  });

  it('ignores whitespace when counting expected glyphs', () => {
    registerMinimalFont('cov.shx');
    const tx: CadText = {
      k: 'text',
      t: 'A B',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'cov.shx',
    };
    expect(countExpectedShxDrawableGlyphs(tx, [0, 0])).toBe(2);
  });

  it('packs ARGB into segment color field matching canvas paint', () => {
    registerMinimalFont('cov.shx');
    const packed = (255 << 24) | 0xffff00;
    const tx: CadText = {
      k: 'text',
      t: 'A',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: packed,
      layer: 0,
      style: 'cov.shx',
    };
    const floats: number[] = [];
    const added = appendShxTextSegmentRecords(floats, tx, [0, 0], 1);
    expect(added).toBeGreaterThan(0);
    const colorBits = colorBitsFromSegmentFloat(floats[4]!);
    expect(colorBits >>> 0).toBe(packed >>> 0);

    const paint = cadTextCanvasPaint(packed, { plotView: true });
    expect(paint.fillStyle).toBe('#ffff00');
    expect(paint.globalAlpha).toBe(1);
  });

  it('mirrorScale flips emitted segment x coordinates (bx mirror)', () => {
    registerMinimalFont('cov.shx');
    const base: CadText = {
      k: 'text',
      t: 'A',
      x: 5,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'cov.shx',
    };
    const plain: number[] = [];
    appendShxTextSegmentRecords(plain, base, [0, 0], 1);
    const mirrored: number[] = [];
    appendShxTextSegmentRecords(mirrored, { ...base, bx: true }, [0, 0], 1);

    expect(mirrorScale(true)).toBe(-1);
    expect(mirrorScale(1)).toBe(1);
    expect(plain[0]! + plain[2]!).not.toBe(mirrored[0]! + mirrored[2]!);
  });

  it('shouldDrawTextOnCanvas skips Latin gpu-marked records after SHX merge', () => {
    registerMinimalFont('cov.shx');
    const texts: CadText[] = [
      {
        k: 'text',
        t: 'AA',
        x: 0,
        y: 0,
        h: 2,
        r: 0,
        c: 0xff000000,
        layer: 0,
        style: 'cov.shx',
      },
    ];
    const out = appendShxGpuSegments(new Float32Array(0), { texts }, [0, 0]);
    expect(out.shxGpuCount).toBe(1);
    expect(out.scene.texts[0]?.gpu).toBe(true);
    expect(shouldDrawTextOnCanvas(out.scene.texts[0]!)).toBe(false);
  });

  it('sanitizeSceneGpuTextFlags strips gpu when SHX geometry is incomplete', () => {
    registerMinimalFont('cov.shx');
    const tx: CadText = {
      k: 'text',
      t: 'AB',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'cov.shx',
      gpu: true,
    };
    const sanitized = sanitizeSceneGpuTextFlags({ texts: [tx] }, [0, 0]);
    expect(sanitized.texts[0]?.gpu).toBeUndefined();
    expect(shouldDrawTextOnCanvas(sanitized.texts[0]!)).toBe(true);
  });
});
