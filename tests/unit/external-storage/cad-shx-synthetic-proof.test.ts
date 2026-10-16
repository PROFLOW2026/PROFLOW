import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseShxFont } from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';
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

/** Pen-down code-8 horizontal stroke. Not a single diagonal stand-in for a letter. */
const H_STROKE = [1, 8, 12, 0, 0];

function shapesFile(nameToken: string, glyphs: Array<[number, number[]]>): Uint8Array {
  const header = new TextEncoder().encode(`AutoCAD-86 shapes 1.0\r\n\x1a`);
  void nameToken;
  const bodies = glyphs.map(([code, bc]) => ({
    code,
    bytes: Uint8Array.from([0, ...bc]),
  }));
  const out = new Uint8Array(header.length + 6 + bodies.length * 4 + bodies.reduce((n, b) => n + b.bytes.length, 0));
  out.set(header, 0);
  let p = header.length + 4;
  out[p] = bodies.length & 255;
  p += 2;
  for (const b of bodies) {
    out[p] = b.code & 255;
    out[p + 2] = b.bytes.length & 255;
    p += 4;
  }
  for (const b of bodies) {
    out.set(b.bytes, p);
    p += b.bytes.length;
  }
  return out;
}

function latinFont(): Uint8Array {
  const glyphs: Array<[number, number[]]> = [];
  for (const ch of 'ABC123') glyphs.push([ch.charCodeAt(0), H_STROKE]);
  glyphs.push([65, [1, 8, 0, 12, 8, 8, 0, 2, 8, 0, 244, 8, 248, 0, 1, 8, 8, 0, 0]]);
  return shapesFile('MIRYL', glyphs);
}

function bigfontFile(code: number): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 bigfont 1.0\r\n\x1a');
  const body = Uint8Array.from([0, ...H_STROKE]);
  const index = 2 + 2 + 2 + 4 + 8;
  const out = new Uint8Array(header.length + index + body.length);
  out.set(header, 0);
  let p = header.length;
  const w16 = (v: number) => {
    out[p] = v & 255;
    out[p + 1] = (v >> 8) & 255;
    p += 2;
  };
  w16(0);
  w16(1);
  w16(1);
  w16(code);
  w16(code);
  w16(code);
  w16(body.length);
  const off = header.length + index;
  out[p] = off & 255;
  p += 4;
  out.set(body, p);
  return out;
}

afterEach(() => {
  clearCadShxFonts();
});

describe('synthetic SHX fixtures', () => {
  it('does not treat the old packed synthetic files as a shapes 1.0 directory', () => {
    const font = parseShxFont('miryl.shx', readFixture('miryl.shx'));
    expect(font).toBeNull();
  });

  it('parses a spec-built multi-glyph font and keeps the three-stroke E', () => {
    const font = parseShxFont('miryl.shx', latinFont());
    expect(font).not.toBeNull();
    for (const ch of 'ABC123') {
      expect(font!.glyphs.get(ch.charCodeAt(0))?.length, ch).toBeGreaterThan(0);
    }
    expect(font!.glyphs.get(65)!.length).toBe(3);
  });

  it('isShxTextRecordGpuComplete and appendShxGpuSegments for synthetic style table binding', () => {
    registerCadShxFonts([
      { name: 'MIRYL.SHX', bytes: latinFont() },
      { name: 'MIRYLB.SHX', bytes: bigfontFile(0x05d0) },
    ]);
    registerCadShxStyleTable([
      { name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' },
      { name: 'TRHEBTXT', font: 'MIRYL.SHX' },
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
    registerCadShxFonts([{ name: 'MIRYL.SHX', bytes: latinFont() }]);
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
      { name: 'HEBTXT.SHX', bytes: latinFont() },
      { name: 'MIRYLB.SHX', bytes: bigfontFile(0x05d0) },
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
