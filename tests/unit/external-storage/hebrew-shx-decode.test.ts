import { describe, expect, it } from 'vitest';
import {
  decodeCp862HebrewString,
  decodeHebrewKeyboardLatin,
  maybeDecodeHebrewShxText,
} from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';

describe('hebrew SHX decode', () => {
  it('maps keyboard-latin placeholder to Hebrew for Hebrew SHX styles', () => {
    const decoded = maybeDecodeHebrewShxText('neuo anur', 'HEBTXT');
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
});
