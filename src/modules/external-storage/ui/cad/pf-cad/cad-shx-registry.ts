import type { ResolvedCadFont } from './font-resolver';
import { parseShxFont, type ShxFont } from './cad-shx-font';

const shxByStyleKey = new Map<string, ShxFont>();

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
