import { currentTextStyleTable, textStyleFontFiles } from './cad-entity-text-style';
import { cadFontFileStemTokens } from './font-resolver';

/**
 * Legacy Hebrew SHX decoding.
 *
 * Profile comes from the font file name (and bigfont file name) when the style
 * table provides one. A style-name substring match is only a fallback when both
 * file names are empty (`source: "style-name-fallback"`).
 *
 * Output is logical Unicode order. Do not reverse here — `bx` / backwards is the
 * renderer's flag.
 *
 * Lead wiring (this module cannot edit those files):
 * - `draw-cad-text.ts` — `maybeDecodeHebrewShxText(line, tx.style)`
 * - `cad-gpu-text-policy.ts` — same helper
 * - `shx-text-segments.ts` — same helper
 * Replace each with `resolveTextEncoding({ text, styleName, fontFile, bigFontFile }).text`
 * after `textStyleFontFiles(styleName, textStyleTable)` from `cad-entity-text-style.ts`.
 */

/** Standard Hebrew (SI-1452) keyboard: Latin key → Hebrew when SHX stored wrong encoding. */
const HEBREW_KEYBOARD_LATIN_TO_HE: Record<string, string> = {
  q: '/',
  w: "'",
  e: 'ק',
  r: 'ר',
  t: 'א',
  y: 'ט',
  u: 'ו',
  i: 'ן',
  o: 'ם',
  p: 'פ',
  '[': ']',
  ']': '[',
  a: 'ש',
  s: 'ד',
  d: 'ג',
  f: 'כ',
  g: 'ע',
  h: 'י',
  j: 'ח',
  k: 'ל',
  l: 'ך',
  ';': 'ף',
  "'": ',',
  z: 'ז',
  x: 'ץ',
  c: 'ב',
  v: 'ה',
  b: 'נ',
  n: 'מ',
  m: 'צ',
  ',': 'ת',
  '.': '.',
  '/': '.',
};

/** Miryl / Mirym SHX often map uppercase Latin the same as lowercase Hebrew keys. */
const MIRYL_KEYBOARD_LATIN_TO_HE: Record<string, string> = {
  ...HEBREW_KEYBOARD_LATIN_TO_HE,
  Q: '/',
  W: "'",
  E: 'ק',
  R: 'ר',
  T: 'א',
  Y: 'ט',
  U: 'ו',
  I: 'ן',
  O: 'ם',
  P: 'פ',
  A: 'ש',
  S: 'ד',
  D: 'ג',
  F: 'כ',
  G: 'ע',
  H: 'י',
  J: 'ח',
  K: 'ל',
  L: 'ך',
  Z: 'ז',
  X: 'ץ',
  C: 'ב',
  V: 'ה',
  B: 'נ',
  N: 'מ',
  M: 'צ',
};

/** Oron / Foron family: same SI-1452 map; prefer CP862 when bytes are present. */
const ORON_KEYBOARD_LATIN_TO_HE = HEBREW_KEYBOARD_LATIN_TO_HE;

/**
 * Style-name fallback only. Font files use stem tokens, not this substring test.
 * `heb` stays so names such as HEBREW / HEBTXT still match when the file is empty.
 */
const HEBREW_STYLE_RE =
  /heb|hebrew|hebtxt|dimheb|sivan|oron|foron|david|narkis|miryl|mirym/i;

/** File-stem tokens (whole token, case-insensitive). `heb` is exact, not a substring. */
const HEBREW_SHX_FILE_TOKENS = new Set([
  'hebtxt',
  'trhebtxt',
  'dimheb',
  'sivan',
  'miryl',
  'mirym',
  'oron',
  'foron',
  'heb',
]);

type HebrewKeyboardProfile = 'standard' | 'miryl' | 'oron';

export type HebrewShxEncodingProfile = 'hebrew-shx' | 'latin';
export type HebrewShxEncodingSource =
  | 'font-file'
  | 'style-name-fallback'
  | 'mojibake-signature'
  | 'none';

export type TextEncodingResult = {
  text: string;
  profile: HebrewShxEncodingProfile;
  /** `font-file` when a style-table file name decided the profile. */
  source: HebrewShxEncodingSource;
  /**
   * `style-name-fallback` or `font-file` when the string is left unchanged,
   * otherwise how the characters were recovered (`cp1252-mojibake`, `cp862-bytes`,
   * `keyboard-layout`, `already-unicode-hebrew`, `not-hebrew-profile`).
   */
  reason: string;
};

export type ResolveTextEncodingInput = {
  text: string;
  styleName?: string | number | null;
  fontFile?: string | null;
  bigFontFile?: string | null;
};

function keyboardProfileForStyle(style: string | number | undefined): HebrewKeyboardProfile {
  if (style == null) return 'standard';
  const name = String(style).trim();
  if (/miryl|mirym/i.test(name)) return 'miryl';
  if (/oron|foron/i.test(name)) return 'oron';
  return 'standard';
}

function keyboardFromTokens(tokens: readonly string[]): HebrewKeyboardProfile | null {
  if (!tokens.some((token) => HEBREW_SHX_FILE_TOKENS.has(token))) return null;
  if (tokens.some((token) => token === 'miryl' || token === 'mirym')) return 'miryl';
  if (tokens.some((token) => token === 'oron' || token === 'foron')) return 'oron';
  return 'standard';
}

function keyboardMapForProfile(profile: HebrewKeyboardProfile): Record<string, string> {
  if (profile === 'miryl') return MIRYL_KEYBOARD_LATIN_TO_HE;
  if (profile === 'oron') return ORON_KEYBOARD_LATIN_TO_HE;
  return HEBREW_KEYBOARD_LATIN_TO_HE;
}

export function hasHebrewBlock(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

export function isHebrewShxStyle(style: string | number | undefined): boolean {
  if (style == null) return false;
  const name = String(style).trim();
  if (!name) return false;
  return HEBREW_STYLE_RE.test(name);
}

/** True when a font / bigfont file stem contains a known Hebrew SHX token. */
export function isHebrewShxFontFile(fontFile: string | null | undefined): boolean {
  if (!fontFile?.trim()) return false;
  return keyboardFromTokens(cadFontFileStemTokens(fontFile)) != null;
}

function appendPercentCode(text: string, i: number): { chunk: string; next: number } | null {
  if (text[i] !== '%' || text[i + 1] !== '%') return null;
  if (text[i + 2] === '%') return { chunk: '%%%', next: i + 3 };
  const third = text[i + 2];
  if (third && /[dpcuoDPCUO]/.test(third)) {
    return { chunk: text.slice(i, i + 3), next: i + 3 };
  }
  if (third && third >= '0' && third <= '9') {
    let j = i + 2;
    let digits = 0;
    while (j < text.length && digits < 3 && text[j]! >= '0' && text[j]! <= '9') {
      digits += 1;
      j += 1;
    }
    return { chunk: text.slice(i, j), next: j };
  }
  return null;
}

function decodeWithKeyboardMap(text: string, map: Record<string, string>): string {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const percent = appendPercentCode(text, i);
    if (percent) {
      out += percent.chunk;
      i = percent.next;
      continue;
    }
    const ch = text[i]!;
    i += 1;
    if (ch <= ' ' || ch > '~') {
      out += ch;
      continue;
    }
    const mapped = map[ch] ?? map[ch.toLowerCase()];
    out += mapped ?? ch;
  }
  return out;
}

/** Map Latin typed on Hebrew keyboard layout to Unicode Hebrew for canvas display. */
export function decodeHebrewKeyboardLatin(
  text: string,
  style?: string | number | undefined,
): string {
  const profile = keyboardProfileForStyle(style);
  return decodeWithKeyboardMap(text, keyboardMapForProfile(profile));
}

/** CP862 Hebrew letters (0x80–0x9A). Box-drawing bytes are not letters. */
const CP862_HEBREW_LETTER: Record<number, string> = {
  0x80: 'א',
  0x81: 'ב',
  0x82: 'ג',
  0x83: 'ד',
  0x84: 'ה',
  0x85: 'ו',
  0x86: 'ז',
  0x87: 'ח',
  0x88: 'ט',
  0x89: 'י',
  0x8a: 'ך',
  0x8b: 'כ',
  0x8c: 'ל',
  0x8d: 'ם',
  0x8e: 'מ',
  0x8f: 'ן',
  0x90: 'נ',
  0x91: 'ס',
  0x92: 'ע',
  0x93: 'ף',
  0x94: 'פ',
  0x95: 'ץ',
  0x96: 'צ',
  0x97: 'ק',
  0x98: 'ר',
  0x99: 'ש',
  0x9a: 'ת',
};

/**
 * Windows-1252 decoding of CP862 Hebrew-letter bytes (0x80–0x9A).
 * Undefined CP1252 bytes (0x81, 0x8D, 0x8F, 0x90) stay as the raw code unit.
 */
const CP1252_REVERSE_HEBREW: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
};

/** Full CP862 page, including symbols, for callers that already hold raw bytes. */
const CP862_TO_UNICODE: Record<number, string> = {
  ...CP862_HEBREW_LETTER,
  0x9b: '·',
  0x9c: '£',
  0x9d: '×',
  0x9e: '§',
  0x9f: ' ',
  0xa0: ' ',
  0xa1: '¡',
  0xa2: '¢',
  0xa3: '£',
  0xa4: '¤',
  0xa5: '¥',
  0xa6: '¦',
  0xa7: '§',
  0xa8: '¨',
  0xa9: '©',
  0xaa: '×',
  0xab: '«',
  0xac: '¬',
  0xad: '­',
  0xae: '®',
  0xaf: '¯',
  0xb0: '°',
  0xb1: '±',
  0xb2: '²',
  0xb3: '│',
  0xb4: '┤',
  0xb5: '╡',
  0xb6: '╢',
  0xb7: '╖',
  0xb8: '╕',
  0xb9: '╣',
  0xba: '║',
  0xbb: '╗',
  0xbc: '╝',
  0xbd: '╜',
  0xbe: '╛',
  0xbf: '┐',
  0xc0: '└',
  0xc1: '┴',
  0xc2: '┬',
  0xc3: '├',
  0xc4: '─',
  0xc5: '┼',
  0xc6: '╞',
  0xc7: '╟',
  0xc8: '╚',
  0xc9: '╔',
  0xca: '╩',
  0xcb: '╦',
  0xcc: '╠',
  0xcd: '═',
  0xce: '╬',
  0xcf: '╧',
  0xd0: '╨',
  0xd1: '╤',
  0xd2: '╥',
  0xd3: '╙',
  0xd4: '╘',
  0xd5: '╒',
  0xd6: '╓',
  0xd7: '╫',
  0xd8: '╪',
  0xd9: '┘',
  0xda: '┌',
  0xdb: '█',
  0xdc: '▄',
  0xdd: '▌',
  0xde: '▐',
  0xdf: '▀',
  0xe0: '₪',
  0xe1: 'Þ',
  0xe2: 'þ',
  0xe3: 'µ',
  0xe4: 'Þ',
  0xe5: 'þ',
  0xe6: '¶',
  0xe7: '·',
  0xe8: '¸',
  0xe9: '¹',
  0xea: '³',
  0xeb: '²',
  0xec: '■',
  0xed: ' ',
  0xf0: '°',
  0xf1: '∙',
  0xf2: '·',
  0xf3: '√',
  0xf4: 'ⁿ',
  0xf5: '²',
  0xf6: '■',
  0xf7: ' ',
  0xf8: ' ',
  0xf9: ' ',
  0xfa: ' ',
  0xfb: ' ',
  0xfc: ' ',
  0xfd: ' ',
  0xfe: ' ',
  0xff: ' ',
};

export function decodeCp862HebrewString(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const mapped = CP862_TO_UNICODE[code];
    out += mapped ?? text[i]!;
  }
  return out;
}

/**
 * CP862 Hebrew letters, either still stored as U+0080–U+009A or as the
 * Windows-1252 characters those bytes become. ASCII is left unchanged.
 * Logical order is preserved (no reverse).
 */
export function recoverCp862HebrewLetters(text: string): {
  text: string;
  rawBytes: number;
  mojibake: number;
} {
  let out = '';
  let rawBytes = 0;
  let mojibake = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i)!;
    const step = code > 0xffff ? 2 : 1;
    if (code >= 0x80 && code <= 0x9a && CP862_HEBREW_LETTER[code]) {
      out += CP862_HEBREW_LETTER[code];
      rawBytes += 1;
    } else {
      const byte = CP1252_REVERSE_HEBREW[code];
      if (byte != null && CP862_HEBREW_LETTER[byte]) {
        out += CP862_HEBREW_LETTER[byte];
        mojibake += 1;
      } else {
        out += text.slice(i, i + step);
      }
    }
    i += step;
  }
  return { text: out, rawBytes, mojibake };
}

/** Skip keyboard remap for obvious English, dimensions, or numeric labels on Hebrew-named styles. */
export function shouldApplyHebrewKeyboardDecode(
  text: string,
  style?: string | number,
  options?: { mapIdentifiers?: boolean },
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  const profile = keyboardProfileForStyle(style);
  if (profile !== 'miryl' && /[A-Z]/.test(trimmed)) return false;
  if (/^[0-9.\-+×°%\\/\s:,;()[\]]+$/.test(trimmed)) return false;
  if (/^[0-9A-Z.\-+×°%\\/\s]+$/.test(trimmed)) return false;
  if (!options?.mapIdentifiers && /^[A-Za-z][A-Za-z0-9._-]*$/.test(trimmed)) return false;
  return true;
}

type ProfileDecision = {
  profile: HebrewShxEncodingProfile;
  source: HebrewShxEncodingSource;
  keyboard: HebrewKeyboardProfile;
};

function decideEncodingProfile(input: ResolveTextEncodingInput): ProfileDecision {
  const fontFile = input.fontFile?.trim() ?? '';
  const bigFontFile = input.bigFontFile?.trim() ?? '';
  const fontKeyboard = fontFile ? keyboardFromTokens(cadFontFileStemTokens(fontFile)) : null;
  const bigKeyboard = bigFontFile ? keyboardFromTokens(cadFontFileStemTokens(bigFontFile)) : null;

  if (fontFile || bigFontFile) {
    const keyboard = fontKeyboard ?? bigKeyboard;
    if (keyboard) {
      return { profile: 'hebrew-shx', source: 'font-file', keyboard };
    }
    return { profile: 'latin', source: 'font-file', keyboard: 'standard' };
  }

  if (isHebrewShxStyle(input.styleName ?? undefined)) {
    return {
      profile: 'hebrew-shx',
      source: 'style-name-fallback',
      keyboard: keyboardProfileForStyle(input.styleName ?? undefined),
    };
  }
  return { profile: 'latin', source: 'none', keyboard: 'standard' };
}

function unchangedReason(decision: ProfileDecision): string {
  if (decision.profile === 'latin' && decision.source === 'font-file') return 'not-hebrew-profile';
  if (decision.source === 'style-name-fallback') return 'style-name-fallback';
  if (decision.source === 'font-file') return 'font-file';
  return 'unchanged';
}

/**
 * entity text + style name + style table `{ fontFile, bigFontFile }`
 * → encoding profile → decoded Unicode (logical order).
 */
export function resolveTextEncoding(input: ResolveTextEncodingInput): TextEncodingResult {
  const text = input.text ?? '';
  const decision = decideEncodingProfile(input);
  if (!text) {
    return { text, profile: decision.profile, source: decision.source, reason: unchangedReason(decision) };
  }
  if (hasHebrewBlock(text)) {
    return {
      text,
      profile: decision.profile,
      source: decision.source,
      reason: 'already-unicode-hebrew',
    };
  }
  if (decision.profile !== 'hebrew-shx') {
    if (decision.source !== 'font-file') {
      const recovered = recoverCp862HebrewLetters(text);
      if (recovered.rawBytes > 0 || recovered.mojibake >= 2) {
        return {
          text: recovered.text,
          profile: 'hebrew-shx',
          source: 'mojibake-signature',
          reason: recovered.mojibake > 0 ? 'cp1252-mojibake' : 'cp862-bytes',
        };
      }
    }
    return {
      text,
      profile: decision.profile,
      source: decision.source,
      reason: unchangedReason(decision),
    };
  }

  const recovered = recoverCp862HebrewLetters(text);
  if (recovered.mojibake > 0 || recovered.rawBytes > 0) {
    return {
      text: recovered.text,
      profile: decision.profile,
      source: decision.source,
      reason: recovered.mojibake > 0 ? 'cp1252-mojibake' : 'cp862-bytes',
    };
  }

  const styleForKeyboard =
    decision.source === 'font-file'
      ? decision.keyboard === 'miryl'
        ? 'miryl'
        : decision.keyboard === 'oron'
          ? 'oron'
          : 'hebrew'
      : input.styleName;
  if (
    !shouldApplyHebrewKeyboardDecode(text, styleForKeyboard ?? undefined, {
      mapIdentifiers: decision.source === 'font-file',
    })
  ) {
    return {
      text,
      profile: decision.profile,
      source: decision.source,
      reason: unchangedReason(decision),
    };
  }
  const mapped = decodeWithKeyboardMap(text, keyboardMapForProfile(decision.keyboard));
  if (mapped === text) {
    return {
      text,
      profile: decision.profile,
      source: decision.source,
      reason: unchangedReason(decision),
    };
  }
  return {
    text: mapped,
    profile: decision.profile,
    source: decision.source,
    reason: 'keyboard-layout',
  };
}

export function maybeDecodeHebrewShxText(
  text: string,
  style: string | number | undefined,
): string {
  return resolveTextEncoding({
    text,
    styleName: style,
    fontFile: '',
    bigFontFile: '',
  }).text;
}

/** Decode using the style table registered with the SHX registry. */
export function decodeCadTextLine(text: string, style: string | number | undefined): string {
  const styleName = style == null ? '' : String(style);
  const files = textStyleFontFiles(styleName, currentTextStyleTable());
  return resolveTextEncoding({
    text,
    styleName,
    fontFile: files.fontFile,
    bigFontFile: files.bigFontFile,
  }).text;
}
