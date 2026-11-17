const CAD_EXTENSION = /\.(dwg|dxf)$/i;

/** Block name or path, without a folder and without the CAD extension. */
export function cadStem(value: string): string {
  const base = value.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
  return base.replace(CAD_EXTENSION, '').toLowerCase();
}

export function sameCadFile(left: string, right: string): boolean {
  const a = cadStem(left);
  const b = cadStem(right);
  return a.length > 0 && a === b;
}

/** A requested name may be served only when this analysis already recorded that xref. */
export function backgroundRequestAllowed(
  requested: string,
  recorded: readonly { name: string; path?: string | null }[],
): boolean {
  return recorded.some((row) => sameCadFile(requested, row.name) || (row.path ? sameCadFile(requested, row.path) : false));
}

/**
 * Paths the drawing may use for this xref.
 * `1545-all-01.dwg` stores `.\1545-Xref-all-02.dwg`, so the short name alone is not enough.
 */
export function xrefDependencyPaths(name: string, recordedPath?: string | null): string[] {
  const base = name.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  const file = CAD_EXTENSION.test(base) ? base : base ? `${base}.dwg` : '';
  const candidates = [recordedPath?.trim() ?? '', file, file ? `./${file}` : '', file ? `.\\${file}` : ''];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    paths.push(candidate);
  }
  return paths;
}

/** Layers that belong to the architectural xref. Host electrical layers stay visible. */
export function architecturalLayerIndexes(
  layers: readonly { index: number; name: string }[],
  xrefNames: readonly string[],
): number[] {
  const stems = new Set(xrefNames.map(cadStem).filter((stem) => stem.length > 0));
  if (stems.size === 0) return [];
  return layers
    .filter((layer) => {
      const head = layer.name.split('|')[0] ?? '';
      return stems.has(cadStem(head));
    })
    .map((layer) => layer.index);
}
