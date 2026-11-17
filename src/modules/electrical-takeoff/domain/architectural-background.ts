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

/** Xref layer prefixes: `File|LAYER` and AutoCAD `File$0$LAYER`. */
function xrefLayerStem(name: string): string {
  const pipe = name.split('|')[0] ?? '';
  if (pipe.length > 0 && pipe.length < name.length) return pipe;
  const nested = name.split(/\$\d+\$/)[0] ?? '';
  if (nested.length > 0 && nested.length < name.length) return nested;
  return '';
}

/** Stems of layers that already carry an xref prefix, including a resolved xref the report no longer lists. */
export function xrefStemsOnLayers(layers: readonly { name: string }[]): string[] {
  const stems = new Set<string>();
  for (const layer of layers) {
    const stem = cadStem(xrefLayerStem(layer.name));
    if (stem.length > 0) stems.add(stem);
  }
  return [...stems];
}

/** Background layers for display. Reported names and prefixes on the loaded layers both count. */
export function displayArchitecturalLayerIndexes(
  layers: readonly { index: number; name: string }[],
  reportedNames: readonly string[],
): number[] {
  return architecturalLayerIndexes(layers, [...reportedNames, ...xrefStemsOnLayers(layers)]);
}

/** Layers that belong to the architectural xref. Host electrical layers stay visible. */
export function architecturalLayerIndexes(
  layers: readonly { index: number; name: string }[],
  xrefNames: readonly string[],
): number[] {
  const stems = new Set(xrefNames.map(cadStem).filter((stem) => stem.length > 0));
  if (stems.size === 0) return [];
  return layers
    .filter((layer) => stems.has(cadStem(xrefLayerStem(layer.name))))
    .map((layer) => layer.index);
}
