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

export function maybeDecodeHebrewShxText(
  text: string,
  style: string | number | undefined,
): string {
  if (!text || hasHebrewBlock(text)) return text;
  if (!isHebrewShxStyle(style)) return text;
  return decodeHebrewKeyboardLatin(text);
}
