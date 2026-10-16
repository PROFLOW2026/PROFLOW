import { describe, expect, it } from 'vitest';

/**
 * Classifier for captured scene-JSON fixtures.
 * It describes stored strings. It does not call the product decoder or renderer.
 */

const CP1252_TO_BYTE = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
]);

/** The four Windows-1252 characters named in the corpus review. */
const CP1252_MOJIBAKE_SIGNATURE = new Set<number>([0x02dc, 0x2026, 0x2030, 0x2122]);

const CP862_HEBREW_BYTES = new Set<number>([
  0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f,
  0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
]);

export type StoredTextEncoding = 'cp1252-of-cp862' | 'other';

function cp862Byte(codePoint: number): number | null {
  if (codePoint >= 0x80 && codePoint <= 0x9f) return codePoint;
  return CP1252_TO_BYTE.get(codePoint) ?? null;
}

export function hasCp1252MojibakeSignature(text: string): boolean {
  for (const char of text) {
    if (CP1252_MOJIBAKE_SIGNATURE.has(char.codePointAt(0)!)) return true;
  }
  return false;
}

/** CP862 Hebrew bytes that were decoded as Windows-1252, or left as C1 controls. */
export function classifyStoredText(text: string): StoredTextEncoding {
  for (const char of text) {
    const byte = cp862Byte(char.codePointAt(0)!);
    if (byte != null && CP862_HEBREW_BYTES.has(byte)) return 'cp1252-of-cp862';
  }
  return 'other';
}

const LATIN_SHX = /^(txt|simplex|romans)(\.shx)?$/i;

export function isLatinFontFile(fontFile: string | null | undefined): boolean {
  if (!fontFile) return false;
  const base = fontFile.trim().replace(/^.*[\\/]/, '');
  return LATIN_SHX.test(base);
}

export type GlyphStatus = 'MISSING' | 'PRESENT' | undefined;

export type CapturedTextFixture = {
  t: string;
  style: string;
  fontFile: string | null;
  bigfont: string | null;
  bx: boolean;
  by: boolean;
  rotation: number;
  widthFactor: number;
  gpu: boolean;
  /** Absent on the 2026-10-16 scene dumps. Present only on the contract fixture. */
  glyphStatus?: GlyphStatus;
};

/**
 * Contract: `gpu: true` is not glyph success when the fixture says the glyph is
 * missing, the string is empty, it contains U+FFFD, or the stored text is
 * CP1252-of-CP862 mojibake.
 */
export function gpuFlagCountsAsGlyphSuccess(record: CapturedTextFixture): boolean {
  if (record.glyphStatus === 'MISSING') return false;
  if (!record.t.trim()) return false;
  if (record.t.includes('\uFFFD')) return false;
  if (classifyStoredText(record.t) === 'cp1252-of-cp862') return false;
  return record.gpu === true;
}

/** 3096-EL model-normal, style TRHEBTXT. Not a textStyleTable row. */
const trhebtxtMojibake: CapturedTextFixture = {
  t: '\u02DC\u2026\u008E\u2030\u2122',
  style: 'TRHEBTXT',
  fontFile: null,
  bigfont: null,
  bx: false,
  by: false,
  rotation: 0,
  widthFactor: 1,
  gpu: false,
};

/** 3031-SW model-normal style S. Table row font is sivan_m.shx; bigfont absent. */
const styleSOnSivan: CapturedTextFixture = {
  t: 'ndi',
  style: 'S',
  fontFile: 'sivan_m.shx',
  bigfont: null,
  bx: true,
  by: false,
  rotation: 6.283185297245176,
  widthFactor: 0.7,
  gpu: false,
};

/** 3096-EL model-normal HANIT_TEXT. gpu true on mojibake; no glyphStatus field in the dump. */
const gpuTrueMojibake: CapturedTextFixture = {
  t: '\u201A\u201A.\u201A',
  style: 'HANIT_TEXT',
  fontFile: null,
  bigfont: null,
  bx: false,
  by: false,
  rotation: 0,
  widthFactor: 1,
  gpu: true,
};

/**
 * The scene JSON has no glyphStatus and no U+FFFD.
 * This fixture is the contract the product must reject: gpu true is not success
 * when the glyph is missing or the stored text is a replacement character.
 */
const gpuTrueMissingGlyphContract: CapturedTextFixture = {
  t: '\uFFFD',
  style: 'HANIT_TEXT',
  fontFile: null,
  bigfont: null,
  bx: false,
  by: false,
  rotation: 0,
  widthFactor: 1,
  gpu: true,
  glyphStatus: 'MISSING',
};

describe('CAD text corpus fixtures', () => {
  it('classifies a TRHEBTXT sample as cp1252-of-cp862 and records the signature', () => {
    expect(classifyStoredText(trhebtxtMojibake.t)).toBe('cp1252-of-cp862');
    expect(hasCp1252MojibakeSignature(trhebtxtMojibake.t)).toBe(true);
    expect(trhebtxtMojibake.style).toBe('TRHEBTXT');
    expect(trhebtxtMojibake.fontFile).toBeNull();
  });

  it('does not treat style S as a Latin font when the file is sivan_m.shx', () => {
    expect(styleSOnSivan.style).toBe('S');
    expect(styleSOnSivan.fontFile).toBe('sivan_m.shx');
    expect(isLatinFontFile(styleSOnSivan.fontFile)).toBe(false);
    expect(styleSOnSivan.bigfont).toBeNull();
    expect(styleSOnSivan.bx).toBe(true);
  });

  it('rejects gpu true as glyph success when the fixture marks MISSING or stores mojibake', () => {
    expect(gpuFlagCountsAsGlyphSuccess(gpuTrueMissingGlyphContract)).toBe(false);
    expect(gpuTrueMissingGlyphContract.gpu).toBe(true);
    expect(gpuTrueMissingGlyphContract.glyphStatus).toBe('MISSING');
    expect(gpuTrueMissingGlyphContract.t).toBe('\uFFFD');

    expect(gpuFlagCountsAsGlyphSuccess(gpuTrueMojibake)).toBe(false);
    expect(gpuTrueMojibake.gpu).toBe(true);
    expect(classifyStoredText(gpuTrueMojibake.t)).toBe('cp1252-of-cp862');
  });
});
