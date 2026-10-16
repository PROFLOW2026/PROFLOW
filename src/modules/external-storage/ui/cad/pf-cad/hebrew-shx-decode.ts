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

const HEBREW_STYLE_RE = /heb|hebrew|sivan|oron|david|narkis|miryo|simplex/i;

type HebrewKeyboardProfile = 'standard' | 'miryl' | 'oron';

function keyboardProfileForStyle(style: string | number | undefined): HebrewKeyboardProfile {
  if (style == null) return 'standard';
  const name = String(style).trim();
  if (/miryl|mirym/i.test(name)) return 'miryl';
  if (/oron|foron/i.test(name)) return 'oron';
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

function decodeWithKeyboardMap(text: string, map: Record<string, string>): string {
  let out = '';
  for (const ch of text) {
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

/** CP862 (DOS Hebrew) code page → Unicode for legacy SHX byte strings. */
const CP862_TO_UNICODE: Record<number, string> = {
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

function countCp862HebrewLetters(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0x80 && code <= 0x9a) n += 1;
  }
  return n;
}

export function maybeDecodeHebrewShxText(
  text: string,
  style: string | number | undefined,
): string {
  if (!text || hasHebrewBlock(text)) return text;
  if (!isHebrewShxStyle(style)) return text;

  const cp862 = decodeCp862HebrewString(text);
  const profile = keyboardProfileForStyle(style);
  const cp862Letters = countCp862HebrewLetters(text);

  if (profile === 'oron' && cp862Letters > 0 && hasHebrewBlock(cp862)) {
    return cp862;
  }
  if (hasHebrewBlock(cp862) && cp862Letters >= Math.max(1, Math.floor(text.length * 0.25))) {
    return cp862;
  }
  return decodeHebrewKeyboardLatin(text, style);
}
