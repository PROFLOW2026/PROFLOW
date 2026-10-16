import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearCadShxFonts,
  registerCadShxFonts,
  registerCadShxStyleTable,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { applyCadP8GpuTextHandoff } from '@/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff';
import { appendShxGpuSegments } from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText, ScenePayload } from '@/modules/external-storage/ui/cad/pf-cad/types';

function handoffScene(texts: CadText[], gpuTexts: number): ScenePayload {
  return {
    space: '*Model_Space',
    origin: [0, 0],
    robustExtent: [0, 0, 0, 0],
    fullExtent: [0, 0, 0, 0],
    segmentCount: 0,
    segmentStride: 8,
    gpuTexts,
    texts,
    layers: [],
    spaces: ['*Model_Space'],
    report: {
      rendered: {},
      skipped: {},
      missingBlocks: {},
      xrefs: {},
      depthCut: 0,
      parserErrors: 0,
    },
  };
}

/** Shapes 1.0 directory: one glyph, pen-down vector, not the old packed layout. */
function minimalShapesFont(shapeNum: number, spec: number[]): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 shapes 1.0\r\n\x1a');
  const body = Uint8Array.from([0, ...spec, ...(spec.at(-1) === 0 ? [] : [0])]);
  const out = new Uint8Array(header.length + 4 + 2 + 4 + body.length);
  out.set(header, 0);
  let p = header.length + 4;
  out[p] = 1;
  p += 2;
  out[p] = shapeNum & 255;
  out[p + 1] = (shapeNum >> 8) & 255;
  out[p + 2] = body.length & 255;
  out[p + 3] = (body.length >> 8) & 255;
  out.set(body, p + 4);
  return out;
}

function registerSyntheticChainFont(): void {
  registerCadShxFonts([
    { name: 'MIRYL.SHX', bytes: minimalShapesFont(65, [1, 0x14, 0]) },
  ]);
}

beforeEach(() => {
  clearCadShxFonts();
});

afterEach(() => {
  clearCadShxFonts();
});

describe('cad-shx-handoff-chain', () => {
  it('appendShxGpuSegments adds segments for DWG style name via style table', () => {
    registerSyntheticChainFont();
    registerCadShxStyleTable([{ name: 'TRHEBTXT', font: 'MIRYL.SHX' }]);

    const texts: CadText[] = [
      {
        k: 'text',
        t: 'A',
        x: 0,
        y: 0,
        h: 2,
        r: 0,
        c: 0xff000000,
        layer: 0,
        style: 'TRHEBTXT',
      },
    ];
    const out = appendShxGpuSegments(new Float32Array(0), { texts }, [0, 0]);
    expect(out.shxGpuCount).toBeGreaterThanOrEqual(1);
    expect(out.segments.length).toBeGreaterThan(0);
    expect(out.scene.texts[0]?.gpu).toBe(true);
  });

  it('appendShxGpuSegments adds segments when style is the .shx file name', () => {
    registerSyntheticChainFont();

    const texts: CadText[] = [
      {
        k: 'text',
        t: 'A',
        x: 0,
        y: 0,
        h: 2,
        r: 0,
        c: 0xff000000,
        layer: 0,
        style: 'MIRYL.SHX',
      },
    ];
    const out = appendShxGpuSegments(new Float32Array(0), { texts }, [0, 0]);
    expect(out.shxGpuCount).toBeGreaterThanOrEqual(1);
    expect(out.segments.length).toBeGreaterThan(0);
    expect(out.scene.texts[0]?.gpu).toBe(true);
  });

  it('applyCadP8GpuTextHandoff merges registerCadShxFonts + style table into wasm segments', () => {
    registerSyntheticChainFont();
    registerCadShxStyleTable([{ name: 'TRHEBTXT', font: 'MIRYL.SHX' }]);

    const texts: CadText[] = [
      {
        k: 'text',
        t: 'A',
        x: 10,
        y: 20,
        h: 2.5,
        r: 0,
        c: 0xff000000,
        layer: 1,
        style: 'TRHEBTXT',
      },
    ];
    const wasmSegments = new Float32Array(8);
    wasmSegments.set([0, 0, 1, 1, 0, 0, 0, 1]);

    const handoff = applyCadP8GpuTextHandoff(wasmSegments, handoffScene(texts, 0));

    expect(handoff.segments.length).toBeGreaterThan(wasmSegments.length);
    expect(handoff.scene.texts[0]?.gpu).toBe(true);
    expect(handoff.scene.gpuTexts).toBeGreaterThanOrEqual(1);
  });

  it('applyCadP8GpuTextHandoff retries append when wasm gpu:true on incomplete client SHX', () => {
    registerSyntheticChainFont();
    registerCadShxStyleTable([{ name: 'TRHEBTXT', font: 'MIRYL.SHX' }]);

    const texts: CadText[] = [
      {
        k: 'text',
        t: 'AB',
        x: 0,
        y: 0,
        h: 2,
        r: 0,
        c: 0xff000000,
        layer: 0,
        style: 'TRHEBTXT',
        gpu: true,
      },
    ];
    const handoff = applyCadP8GpuTextHandoff(new Float32Array(0), handoffScene(texts, 1));
    expect(handoff.scene.texts[0]?.gpu).toBeUndefined();
  });
});
