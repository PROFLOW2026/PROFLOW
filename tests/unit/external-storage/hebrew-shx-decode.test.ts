import { describe, expect, it } from 'vitest';
import { textStyleFontFiles } from '@/modules/external-storage/ui/cad/pf-cad/cad-entity-text-style';
import {
  decodeCp862HebrewString,
  decodeHebrewKeyboardLatin,
  isHebrewShxStyle,
  maybeDecodeHebrewShxText,
  resolveTextEncoding,
  shouldApplyHebrewKeyboardDecode,
} from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';

/** CP862 ראש (0x98, 0x80, 0x99) misread as Windows-1252: ˜ € ™ */
const ROSH_MOJIBAKE = '\u02DC\u20AC\u2122';
const ROSH = 'ראש';

describe('hebrew SHX decode', () => {
  it('maps keyboard-latin placeholder to Hebrew for Hebrew SHX styles', () => {
    const decoded = maybeDecodeHebrewShxText('neuo anur', 'HEBREW');
    expect(decoded).toBe('מקום שמור');
  });

  it('decodes CP862 Hebrew bytes', () => {
    const raw = String.fromCharCode(0x9e, 0x9f, 0x90);
    expect(decodeCp862HebrewString(raw)).toBe('§ נ');
  });

  it('prefers CP862 for Oron-style names when bytes are present', () => {
    const raw = String.fromCharCode(0x97, 0x98, 0x80);
    const decoded = maybeDecodeHebrewShxText(raw, 'ORON');
    expect(decoded).toBe('קרא');
  });

  it('maps uppercase Latin for Miryl profiles', () => {
    expect(decodeHebrewKeyboardLatin('E', 'MIRYL')).toBe('ק');
  });

  it('does not treat simplex or romans as Hebrew SHX styles', () => {
    expect(isHebrewShxStyle('simplex.shx')).toBe(false);
    expect(isHebrewShxStyle('ROMANS')).toBe(false);
    expect(maybeDecodeHebrewShxText('ROOM 101', 'simplex')).toBe('ROOM 101');
    expect(maybeDecodeHebrewShxText('12.5', 'txt')).toBe('12.5');
  });

  it('recognizes audit Hebrew font names including miryl and sivan_m', () => {
    expect(isHebrewShxStyle('sivan_m')).toBe(true);
    expect(isHebrewShxStyle('miryl')).toBe(true);
    expect(isHebrewShxStyle('hebtxt')).toBe(true);
    expect(isHebrewShxStyle('dimheb')).toBe(true);
  });

  it('skips keyboard decode for English labels on Hebrew styles', () => {
    expect(shouldApplyHebrewKeyboardDecode('ROOM 101', 'HEBREW')).toBe(false);
    expect(shouldApplyHebrewKeyboardDecode('12.5', 'ORON')).toBe(false);
    expect(maybeDecodeHebrewShxText('ROOM 101', 'HEBREW')).toBe('ROOM 101');
  });

  it('still decodes 3031-style keyboard latin on sivan_m', () => {
    expect(maybeDecodeHebrewShxText('neuo anur', 'sivan_m')).toBe('מקום שמור');
  });

  /** Keyboard-latin label from 3096-EL WASM audit (style M in DWG; HEBTXT/TRHEBTXT fonts). */
  it('still decodes 3096-EL audit keyboard-latin sample on HEBTXT', () => {
    const raw = '1-ha keck thaur vuugsv k,fbui uc';
    const decoded = maybeDecodeHebrewShxText(raw, 'HEBTXT');
    expect(decoded).not.toBe(raw);
    expect(decoded).toMatch(/[\u0590-\u05FF]/);
    expect(maybeDecodeHebrewShxText(raw, 'TRHEBTXT')).toBe(decoded);
  });

  it('recovers CP1252 mojibake of CP862 ראש from sivan_m.shx even when the style name is S', () => {
    const files = textStyleFontFiles('S', [
      { name: 'S', font: 'sivan_m.shx' },
      { name: 'STANDARD', font: 'simplex.shx' },
    ]);
    const decoded = resolveTextEncoding({
      text: ROSH_MOJIBAKE,
      styleName: 'S',
      fontFile: files.fontFile,
      bigFontFile: files.bigFontFile,
    });
    expect(files.fontFile).toBe('sivan_m.shx');
    expect(decoded.text).toBe(ROSH);
    expect(decoded.text).not.toBe('שאר');
    expect(decoded.profile).toBe('hebrew-shx');
    expect(decoded.source).toBe('font-file');
    expect(decoded.reason).toBe('cp1252-mojibake');
    expect(resolveTextEncoding(decoded).text).toBe(ROSH);
  });

  it('does not convert the same mojibake for simplex.shx or txt.shx', () => {
    for (const fontFile of ['simplex.shx', 'txt.shx']) {
      const decoded = resolveTextEncoding({
        text: ROSH_MOJIBAKE,
        styleName: 'STANDARD',
        fontFile,
        bigFontFile: '',
      });
      expect(decoded.text).toBe(ROSH_MOJIBAKE);
      expect(decoded.profile).toBe('latin');
      expect(decoded.source).toBe('font-file');
    }
  });

  it('leaves ASCII labels unchanged under a Hebrew font profile', () => {
    for (const text of ['A-12', '3096']) {
      const decoded = resolveTextEncoding({
        text,
        styleName: 'S',
        fontFile: 'sivan_m.shx',
      });
      expect(decoded.text).toBe(text);
      expect(decoded.profile).toBe('hebrew-shx');
      expect(decoded.source).toBe('font-file');
    }
  });

  it('keeps Unicode Hebrew and does not reverse or double-decode', () => {
    const decoded = resolveTextEncoding({
      text: ROSH,
      styleName: 'S',
      fontFile: 'sivan_m.shx',
    });
    expect(decoded.text).toBe(ROSH);
    expect(decoded.reason).toBe('already-unicode-hebrew');
    const mixed = resolveTextEncoding({
      text: `A-12${ROSH_MOJIBAKE}`,
      styleName: 'S',
      fontFile: 'sivan_m.shx',
    });
    expect(mixed.text).toBe(`A-12${ROSH}`);
  });

  it('uses style-name fallback for TRHEBTXT only when the font file is empty', () => {
    const decoded = resolveTextEncoding({
      text: '3096',
      styleName: 'TRHEBTXT',
      fontFile: '',
      bigFontFile: '',
    });
    expect(decoded.profile).toBe('hebrew-shx');
    expect(decoded.source).toBe('style-name-fallback');
    expect(decoded.reason).toBe('style-name-fallback');
    expect(decoded.text).toBe('3096');
    expect(
      resolveTextEncoding({ text: '3096', styleName: 'S', fontFile: '', bigFontFile: '' }).profile,
    ).toBe('latin');
  });

  it('preserves %% codes and does not reverse a CP862 letter run', () => {
    expect(
      resolveTextEncoding({
        text: '%%d12',
        styleName: 'HEBTXT',
        fontFile: 'hebtxt.shx',
      }).text,
    ).toBe('%%d12');
    const raw = String.fromCharCode(0x98, 0x80, 0x99);
    const decoded = resolveTextEncoding({
      text: raw,
      styleName: 'S',
      fontFile: 'sivan_m.shx',
    });
    expect(decoded.text).toBe(ROSH);
    expect(decoded.reason).toBe('cp862-bytes');
    expect([...decoded.text].reverse().join('')).not.toBe(decoded.text);
  });

  it('maps lowercase keyboard Latin when the font file is sivan_m.shx', () => {
    const decoded = resolveTextEncoding({
      text: 'ndi',
      styleName: 'S',
      fontFile: 'sivan_m.shx',
    });
    expect(decoded.reason).toBe('keyboard-layout');
    expect(decoded.text).toBe('מגן');
    expect(decoded.source).toBe('font-file');
  });

  it('recovers CP1252 mojibake on HANIT_TEXT when the style table has no font file', () => {
    const decoded = resolveTextEncoding({
      text: ROSH_MOJIBAKE,
      styleName: 'HANIT_TEXT',
      fontFile: '',
      bigFontFile: '',
    });
    expect(decoded.text).toBe(ROSH);
    expect(decoded.source).toBe('mojibake-signature');
    expect(decoded.reason).toBe('cp1252-mojibake');
  });

  it('does not treat a single trademark character as Hebrew', () => {
    const decoded = resolveTextEncoding({
      text: 'ACME\u2122',
      styleName: 'STANDARD',
      fontFile: '',
    });
    expect(decoded.text).toBe('ACME\u2122');
    expect(decoded.profile).toBe('latin');
  });
});
