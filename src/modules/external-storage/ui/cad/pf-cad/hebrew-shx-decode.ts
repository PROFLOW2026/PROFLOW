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

const HEBREW_STYLE_RE = /heb|hebrew|sivan|oron|david|narkis|miryo|simplex/i;

export function hasHebrewBlock(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

export function isHebrewShxStyle(style: string | number | undefined): boolean {
  if (style == null) return false;
  const name = String(style).trim();
  if (!name) return false;
  return HEBREW_STYLE_RE.test(name);
}

/** Map Latin typed on Hebrew keyboard layout to Unicode Hebrew for canvas display. */
export function decodeHebrewKeyboardLatin(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch <= ' ' || ch > '~') {
      out += ch;
      continue;
    }
    const lower = ch.toLowerCase();
    const mapped = HEBREW_KEYBOARD_LATIN_TO_HE[lower];
    if (mapped != null) {
      out += ch === lower ? mapped : mapped;
    } else {
      out += ch;
    }
  }
  return out;
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
  0xe0: '₪',
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

export function maybeDecodeHebrewShxText(
  text: string,
  style: string | number | undefined,
): string {
  if (!text || hasHebrewBlock(text)) return text;
  if (!isHebrewShxStyle(style)) return text;
  const cp862 = decodeCp862HebrewString(text);
  if (hasHebrewBlock(cp862)) return cp862;
  return decodeHebrewKeyboardLatin(text);
}
