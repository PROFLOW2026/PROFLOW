import { describe, expect, it } from 'vitest';
import {
  decodeCp862HebrewString,
  decodeHebrewKeyboardLatin,
  isHebrewShxStyle,
  maybeDecodeHebrewShxText,
  shouldApplyHebrewKeyboardDecode,
} from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';

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
});
