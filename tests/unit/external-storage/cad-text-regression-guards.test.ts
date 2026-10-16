import { afterEach, describe, expect, it } from 'vitest';
import { cadTextCanvasPaint } from '@/modules/external-storage/ui/cad/pf-cad/cad-text-canvas-color';
import { drawShxLine } from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';
import {
  clearCadShxFonts,
  registerCadShxFonts,
  registerCadShxStyleTable,
  resolveShxDrawContext,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { maybeDecodeHebrewShxText } from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';
import { mirrorScale } from '@/modules/external-storage/ui/cad/pf-cad/draw-cad-text';
import {
  mayMarkTextGpu,
  P8_GPU_TEXT_HANDOFF_ENABLED,
  shouldDrawTextOnCanvas,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy';
import { applyCadP8GpuTextHandoff } from '@/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff';
import {
  appendShxGpuSegments,
  isShxTextRecordGpuComplete,
} from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

/** Shapes 1.0 with glyph A only, so Hebrew code points stay missing. */
function latinOnlyShapesFont(): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 shapes 1.0\r\n\x1a');
  const body = Uint8Array.from([0, 1, 0x14, 0]);
  const out = new Uint8Array(header.length + 4 + 2 + 4 + body.length);
  out.set(header, 0);
  let p = header.length + 4;
  out[p] = 1;
  p += 2;
  out[p] = 65;
  out[p + 2] = body.length & 255;
  out.set(body, p + 4);
  return out;
}

afterEach(() => {
  clearCadShxFonts();
});

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

  it('HEBTXT decoded Hebrew uses canvas TTF fill when SHX/bigfont lack glyphs', () => {
    registerCadShxFonts([
      { name: 'HEBTXT.SHX', bytes: latinOnlyShapesFont() },
      { name: 'MIRYLB.SHX', bytes: latinOnlyShapesFont() },
    ]);
    registerCadShxStyleTable([{ name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' }]);

    const decoded = maybeDecodeHebrewShxText('neuo anur', 'HEBTXT');
    expect(decoded).toBe('מקום שמור');

    const shxCtx = resolveShxDrawContext('HEBTXT');
    expect(shxCtx.primary).toBeDefined();

    let strokeCalls = 0;
    let fillTextCalls = 0;
    const ctx = {
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '',
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {
        strokeCalls += 1;
      },
      fillText(_ch: string) {
        fillTextCalls += 1;
      },
    } as unknown as CanvasRenderingContext2D;

    drawShxLine(
      ctx,
      shxCtx.primary!,
      decoded,
      10,
      '#000',
      shxCtx.mapCode,
      shxCtx.pickFont,
      {
        fontPx: 10,
        family: 'Arial',
        baseFamily: 'sans-serif',
        hebrewWhenMissing: true,
        hasHebrew: (ch) => /[\u0590-\u05FF]/.test(ch),
        fillWhenMissing: true,
      },
    );

    expect(strokeCalls).toBe(0);
    expect(fillTextCalls).toBeGreaterThanOrEqual(decoded.replace(/\s/g, '').length);
  });

  it('shouldDrawTextOnCanvas stays true when gpu leaks on incomplete Hebrew client SHX', () => {
    registerCadShxFonts([
      { name: 'MIRYL.SHX', bytes: latinOnlyShapesFont() },
      { name: 'MIRYLB.SHX', bytes: latinOnlyShapesFont() },
    ]);
    registerCadShxStyleTable([
      { name: 'TRHEBTXT', font: 'MIRYL.SHX', big: 'MIRYLB.SHX' },
      { name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' },
    ]);

    const origin: [number, number] = [0, 0];
    const tx: CadText = {
      k: 'text',
      t: 'neuo anur',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'TRHEBTXT',
      gpu: true,
    };
    expect(isShxTextRecordGpuComplete(tx, origin)).toBe(false);
    expect(shouldDrawTextOnCanvas(tx)).toBe(true);
  });

  it('3096 TRHEBTXT keyboard-latin strips wasm gpu and keeps Canvas after P8 handoff', () => {
    const tx: CadText = {
      k: 'text',
      t: 'neuo anur',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'TRHEBTXT',
      gpu: true,
    };
    const out = applyCadP8GpuTextHandoff(new Float32Array(0), {
      texts: [tx],
      origin: [0, 0],
      gpuTexts: 1,
    } as never);
    expect(out.scene.texts[0]?.gpu).toBeUndefined();
    expect(shouldDrawTextOnCanvas(out.scene.texts[0]!)).toBe(true);
    expect(maybeDecodeHebrewShxText('neuo anur', 'TRHEBTXT')).toBe('מקום שמור');
  });
});
