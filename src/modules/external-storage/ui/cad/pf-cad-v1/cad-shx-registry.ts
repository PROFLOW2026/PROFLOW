import type { ResolvedCadFont } from './font-resolver';
import { parseShxBigfontMap, parseShxFont, type ShxFont } from './cad-shx-font';

const shxByStyleKey = new Map<string, ShxFont>();
const bigfontMaps = new Map<string, Map<number, number>>();

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

export function registerCadShxFonts(resolved: ResolvedCadFont[]): string[] {
  const loaded: string[] = [];
  for (const font of resolved) {
    if (!/\.shx$/i.test(font.name)) continue;
    const big = parseShxBigfontMap(font.bytes);
    if (big) {
      for (const key of styleKeysForFontName(font.name)) {
        bigfontMaps.set(key.toLowerCase(), big);
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
  return loaded;
}

export function clearCadShxFonts(): void {
  shxByStyleKey.clear();
  bigfontMaps.clear();
}

export function resolveShxGlyphCode(style: string | undefined, charCode: number): number {
  if (!style) return charCode;
  const map =
    bigfontMaps.get(style.toLowerCase()) ??
    bigfontMaps.get(`${style}.shx`.toLowerCase());
  return map?.get(charCode) ?? charCode;
}

export function lookupShxFont(style: string | number | undefined): ShxFont | undefined {
  if (style == null) return undefined;
  const raw = String(style).trim();
  if (!raw) return undefined;
  return (
    shxByStyleKey.get(raw.toLowerCase()) ??
    shxByStyleKey.get(`${raw}.shx`.toLowerCase()) ??
    shxByStyleKey.get(raw.replace(/\.shx$/i, '').toLowerCase())
  );
}
