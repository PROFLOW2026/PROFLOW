import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearCadShxFonts,
  registerCadShxFonts,
  registerCadShxStyleTable,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { applyCadP8GpuTextHandoff } from '@/modules/external-storage/ui/cad/pf-cad/apply-p8-text-handoff';
import { appendShxGpuSegments } from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

function minimalShapesFont(name: string, shapeNum: number, spec: number[]): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  bytes.set([0x1a, 0, shapeNum, spec.length, ...spec], 24);
  return bytes;
}

function registerSyntheticChainFont(): void {
  registerCadShxFonts([
    { name: 'MIRYL.SHX', bytes: minimalShapesFont('MIRYL.SHX', 65, [1, 16, 14]) },
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

    const handoff = applyCadP8GpuTextHandoff(wasmSegments, {
      texts,
      origin: [0, 0],
      gpuTexts: 0,
      segmentStride: 8,
    });

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
    const handoff = applyCadP8GpuTextHandoff(new Float32Array(0), {
      texts,
      origin: [0, 0],
      gpuTexts: 1,
      segmentStride: 8,
    });
    expect(handoff.scene.texts[0]?.gpu).toBeUndefined();
  });
});
