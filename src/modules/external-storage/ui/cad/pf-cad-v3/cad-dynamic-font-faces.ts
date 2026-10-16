const registered = new Set<string>();

function safeFamilyName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
  return `pf-cad-${base || 'font'}`;
}

/** Register customer TTF/OTF from storage as @font-face for canvas overlay. SHX stays on substitute + decode path. */
export function registerCadOverlayFonts(
  fonts: ReadonlyArray<{ name: string; bytes: Uint8Array }>,
): Map<string, string> {
  const styleToFamily = new Map<string, string>();
  if (typeof document === 'undefined') return styleToFamily;

  for (const font of fonts) {
    const lower = font.name.toLowerCase();
    if (!/\.(ttf|otf|ttc)$/i.test(lower)) {
      continue;
    }
    const family = safeFamilyName(font.name);
    if (registered.has(family)) {
      styleToFamily.set(font.name, family);
      styleToFamily.set(lower, family);
      continue;
    }
    const blob = new Blob([Uint8Array.from(font.bytes)], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const style = document.createElement('style');
    style.textContent = `@font-face{font-family:"${family}";src:url("${url}") format("truetype");font-weight:400;font-style:normal;font-display:swap;}`;
    document.head.appendChild(style);
    registered.add(family);
    styleToFamily.set(font.name, family);
    styleToFamily.set(lower, family);
    const stem = font.name.replace(/\.[^.]+$/i, '');
    if (stem) {
      styleToFamily.set(stem, family);
      styleToFamily.set(stem.toLowerCase(), family);
    }
  }
  return styleToFamily;
}

export function resolveCadTextFontFamily(
  style: string | number | undefined,
  styleMap: Map<string, string> | null,
  fallback: string,
): string {
  if (!styleMap || style == null) return fallback;
  const key = String(style).trim();
  if (!key) return fallback;
  return (
    styleMap.get(key) ??
    styleMap.get(key.toLowerCase()) ??
    styleMap.get(`${key}.shx`) ??
    styleMap.get(`${key.toLowerCase()}.shx`) ??
    fallback
  );
}
