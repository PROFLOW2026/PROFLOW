import type { ResolvedCadFont } from './font-resolver';
import type { CadTextStyleTableEntry } from './types';
import {
  parseShxBigfontFile,
  parseShxFont,
  type ShxBigfontBundle,
  type ShxFont,
} from './cad-shx-font';

const shxByStyleKey = new Map<string, ShxFont>();
const bigfontByStyleKey = new Map<string, ShxBigfontBundle>();
/** Primary SHX keyed for a text style when bigfont companion was registered. */
const primaryForBigfont = new Map<string, string>();

function styleKeysForFontName(name: string): string[] {
  const base = name.trim();
  const keys = [base, base.toLowerCase()];
  if (/\.shx$/i.test(base)) {
    keys.push(base.replace(/\.shx$/i, ''));
  } else {
    keys.push(`${base}.shx`);
  }
  return keys;
}

function linkBigfontCompanion(bigfontName: string): void {
  const stem = bigfontName.replace(/\.shx$/i, '');
  const candidates = [
    stem.replace(/big$/i, ''),
    stem.replace(/_big$/i, ''),
    stem.replace(/b$/i, ''),
    stem.replace(/bigfont$/i, ''),
  ].filter((c) => c.length > 0 && c.toLowerCase() !== stem.toLowerCase());
  for (const primary of candidates) {
    for (const pk of styleKeysForFontName(primary)) {
      const font = shxByStyleKey.get(pk.toLowerCase());
      if (font) {
        for (const bk of styleKeysForFontName(bigfontName)) {
          primaryForBigfont.set(bk.toLowerCase(), pk.toLowerCase());
        }
        return;
      }
    }
  }
}

export function registerCadShxFonts(resolved: ResolvedCadFont[]): string[] {
  const loaded: string[] = [];
  for (const font of resolved) {
    if (!/\.shx$/i.test(font.name)) continue;
    const bigBundle = parseShxBigfontFile(font.name, font.bytes);
    if (bigBundle) {
      for (const key of styleKeysForFontName(font.name)) {
        bigfontByStyleKey.set(key.toLowerCase(), bigBundle);
        shxByStyleKey.set(key.toLowerCase(), bigBundle.font);
      }
      loaded.push(font.name);
      continue;
    }
    const parsed = parseShxFont(font.name, font.bytes);
    if (!parsed) continue;
    for (const key of styleKeysForFontName(font.name)) {
      shxByStyleKey.set(key.toLowerCase(), parsed);
    }
    loaded.push(font.name);
  }
  for (const name of loaded) {
    if (/big/i.test(name)) {
      linkBigfontCompanion(name);
    }
  }
  return loaded;
}

function loadedShxKeyForFontFile(fontFile: string): string | undefined {
  const trimmed = fontFile.trim();
  if (!trimmed) return undefined;
  for (const key of styleKeysForFontName(trimmed)) {
    const k = key.toLowerCase();
    if (shxByStyleKey.has(k) || bigfontByStyleKey.has(k)) return k;
  }
  return undefined;
}

/** Map DWG style names (e.g. TRHEBTXT) to registered SHX font keys (e.g. miryl.shx). */
export function registerCadShxStyleTable(entries: CadTextStyleTableEntry[] | undefined): number {
  if (!entries?.length) return 0;
  let linked = 0;
  for (const entry of entries) {
    const styleKeys = styleKeysForFontName(entry.name);
    const primaryKey = entry.font ? loadedShxKeyForFontFile(entry.font) : undefined;
    const bigKey = entry.big ? loadedShxKeyForFontFile(entry.big) : undefined;

    if (primaryKey) {
      const font = shxByStyleKey.get(primaryKey)!;
      for (const sk of styleKeys) {
        shxByStyleKey.set(sk.toLowerCase(), font);
      }
      linked += 1;
    }

    if (bigKey) {
      const bundle = bigfontByStyleKey.get(bigKey);
      if (bundle) {
        for (const sk of styleKeys) {
          const k = sk.toLowerCase();
          bigfontByStyleKey.set(k, bundle);
          shxByStyleKey.set(k, bundle.font);
        }
      }
    }

    if (primaryKey && bigKey) {
      for (const sk of styleKeys) {
        primaryForBigfont.set(sk.toLowerCase(), primaryKey);
      }
      if (entry.big) {
        for (const bk of styleKeysForFontName(entry.big)) {
          primaryForBigfont.set(bk.toLowerCase(), primaryKey);
        }
      }
    }
  }
  return linked;
}

export function registerCadShxTextStyleAliases(
  texts: ReadonlyArray<{ style?: string | number }> | undefined,
): number {
  if (!texts?.length) return 0;
  let linked = 0;
  const seen = new Set<string>();
  for (const tx of texts) {
    const name = tx.style != null ? String(tx.style).trim() : '';
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (lookupShxFont(name)) continue;
    const primaryKey = loadedShxKeyForFontFile(name);
    if (!primaryKey) continue;
    const font = shxByStyleKey.get(primaryKey);
    if (!font) continue;
    for (const sk of styleKeysForFontName(name)) {
      shxByStyleKey.set(sk.toLowerCase(), font);
    }
    linked += 1;
  }
  return linked;
}

export function clearCadShxFonts(): void {
  shxByStyleKey.clear();
  bigfontByStyleKey.clear();
  primaryForBigfont.clear();
}

function styleLookupKeys(style: string): string[] {
  const raw = style.trim();
  const keys = [raw.toLowerCase(), `${raw}.shx`.toLowerCase(), raw.replace(/\.shx$/i, '').toLowerCase()];
  return keys;
}

export function lookupBigfontBundle(style: string | undefined): ShxBigfontBundle | undefined {
  if (!style) return undefined;
  for (const key of styleLookupKeys(style)) {
    const hit = bigfontByStyleKey.get(key);
    if (hit) return hit;
  }
  return undefined;
}

export function resolveShxGlyphCode(style: string | undefined, charCode: number): number {
  const bundle = lookupBigfontBundle(style);
  if (bundle?.map.has(charCode)) {
    return bundle.map.get(charCode)!;
  }
  if (!style) return charCode;
  for (const key of styleLookupKeys(style)) {
    const map = bigfontByStyleKey.get(key)?.map;
    if (map?.has(charCode)) return map.get(charCode)!;
  }
  return charCode;
}

/** Pick primary vs bigfont glyph container for a mapped code. */
export function pickShxFontForGlyph(
  style: string | undefined,
  charCode: number,
  mappedCode: number,
): ShxFont | undefined {
  const bundle = lookupBigfontBundle(style);
  if (bundle?.map.has(charCode) && bundle.font.glyphs.has(mappedCode)) {
    return bundle.font;
  }
  if (!style) return undefined;
  for (const key of styleLookupKeys(style)) {
    const linkedPrimary = primaryForBigfont.get(key);
    if (linkedPrimary) {
      const primary = shxByStyleKey.get(linkedPrimary);
      if (primary?.glyphs.has(mappedCode)) return primary;
    }
    const primary = shxByStyleKey.get(key);
    if (primary?.glyphs.has(mappedCode)) return primary;
    const big = bigfontByStyleKey.get(key);
    if (big?.font.glyphs.has(mappedCode)) return big.font;
  }
  return lookupShxFont(style);
}

export function lookupShxFont(style: string | number | undefined): ShxFont | undefined {
  if (style == null) return undefined;
  const raw = String(style).trim();
  if (!raw) return undefined;
  for (const key of styleLookupKeys(raw)) {
    const linked = primaryForBigfont.get(key);
    if (linked) {
      const primary = shxByStyleKey.get(linked);
      if (primary) return primary;
    }
    const hit = shxByStyleKey.get(key);
    if (hit) return hit;
  }
  return undefined;
}

export function resolveShxDrawContext(style: string | undefined): {
  primary: ShxFont | undefined;
  mapCode: (code: number) => number;
  pickFont: (code: number, mapped: number) => ShxFont | undefined;
} {
  const primary = lookupShxFont(style);
  const mapCode = (code: number) => resolveShxGlyphCode(style, code);
  const pickFont = (code: number, mapped: number) =>
    pickShxFontForGlyph(style, code, mapped) ?? primary;
  return { primary, mapCode, pickFont };
}
