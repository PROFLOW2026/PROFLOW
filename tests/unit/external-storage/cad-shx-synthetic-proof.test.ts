import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeShapeVectors, parseShxFont } from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';
import { shouldDrawTextOnCanvas } from '@/modules/external-storage/ui/cad/pf-cad/cad-gpu-text-policy';
import {
  clearCadShxFonts,
  registerCadShxFonts,
  registerCadShxStyleTable,
  registerCadShxTextStyleAliases,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import {
  appendShxGpuSegments,
  isShxTextRecordGpuComplete,
} from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

const fixtureDir = path.join(process.cwd(), 'tests/fixtures/cad/synthetic-shx');

function readFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(fixtureDir, name)));
}

afterEach(() => {
  clearCadShxFonts();
});

describe('synthetic SHX fixtures', () => {
  it('parses multi-glyph latin font with decodeShapeVectors strokes per codepoint', () => {
    const bytes = readFixture('miryl.shx');
    const font = parseShxFont('miryl.shx', bytes);
    expect(font).not.toBeNull();
    for (const ch of 'AZ09!') {
      const code = ch.charCodeAt(0);
      const specStart = font!.glyphs.get(code);
      expect(specStart, ch).toBeDefined();
      expect(specStart!.length).toBeGreaterThan(0);
    }
    const sample = font!.glyphs.get(65)!;
    expect(decodeShapeVectors(new Uint8Array([1, 16, 14])).length).toBe(sample.length);
  });

  it('isShxTextRecordGpuComplete and appendShxGpuSegments for synthetic style table binding', () => {
    registerCadShxFonts([
      { name: 'MIRYL.SHX', bytes: readFixture('MIRYL.SHX') },
      { name: 'MIRYLB.SHX', bytes: readFixture('MIRYLB.SHX') },
    ]);
    registerCadShxStyleTable([
      { name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' },
      { name: 'TRHEBTXT', font: 'MIRYL.SHX' },
    ]);

    const tx: CadText = {
      k: 'text',
      t: 'ABC123',
      x: 0,
      y: 0,
      h: 2.5,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'TRHEBTXT',
    };
    const origin: [number, number] = [0, 0];
    expect(isShxTextRecordGpuComplete(tx, origin)).toBe(true);

    const out = appendShxGpuSegments(new Float32Array(0), { texts: [tx] }, origin);
    expect(out.shxGpuCount).toBe(1);
    expect(out.segments.length).toBeGreaterThan(0);
    expect(out.scene.texts[0]?.gpu).toBe(true);
    expect(shouldDrawTextOnCanvas(out.scene.texts[0]!)).toBe(false);
  });

  it('registerCadShxTextStyleAliases is idempotent when style already resolves to loaded SHX', () => {
    registerCadShxFonts([{ name: 'MIRYL.SHX', bytes: readFixture('MIRYL.SHX') }]);
    const linked = registerCadShxTextStyleAliases([{ style: 'MIRYL.SHX' }]);
    expect(linked).toBe(0);
    const tx: CadText = {
      k: 'text',
      t: 'A',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'MIRYL.SHX',
    };
    expect(isShxTextRecordGpuComplete(tx, [0, 0])).toBe(true);
  });

  it('does not link TRHEBTXT via substring heuristics without a style-table row', () => {
    registerCadShxFonts([
      { name: 'HEBTXT.SHX', bytes: readFixture('HEBTXT.SHX') },
      { name: 'MIRYLB.SHX', bytes: readFixture('MIRYLB.SHX') },
    ]);
    registerCadShxStyleTable([{ name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' }]);
    registerCadShxTextStyleAliases([{ style: 'TRHEBTXT' }]);

    const tx: CadText = {
      k: 'text',
      t: 'A',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'TRHEBTXT',
    };
    expect(isShxTextRecordGpuComplete(tx, [0, 0])).toBe(false);
  });
});
