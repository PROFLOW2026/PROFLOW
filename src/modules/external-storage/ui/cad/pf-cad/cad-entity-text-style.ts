import type { CadTextStyleTableEntry } from './types';

let cachedTextStyleTable: readonly CadTextStyleTableEntry[] | undefined;

/** Scene style table captured when the SHX registry is loaded. */
export function setCachedTextStyleTable(
  table: readonly CadTextStyleTableEntry[] | undefined,
): void {
  cachedTextStyleTable = table?.length ? table : undefined;
}

export function currentTextStyleTable(): readonly CadTextStyleTableEntry[] | undefined {
  return cachedTextStyleTable;
}

/** Prefixes seen on entity `style` strings that are not DWG table row names (XREF/blocks/Revit). */
const ENTITY_STYLE_PREFIX_STRIPS: ReadonlyArray<(s: string) => string | null> = [
  (s) => (/^TR(?=[A-Z_])/i.test(s) ? s.replace(/^TR/i, '') : null),
  (s) => (s.startsWith('REVIT_') ? s.slice('REVIT_'.length) : null),
];

/**
 * Alternate spellings to try when resolving entity styles against storage / SHX registry.
 * Does not assume a font file exists named exactly like the style.
 */
export function entityStyleFontNameCandidates(style: string): string[] {
  const trimmed = style.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  push(trimmed);
  for (const strip of ENTITY_STYLE_PREFIX_STRIPS) {
    const alt = strip(trimmed);
    if (alt) push(alt);
  }
  return out;
}

/**
 * Exact text-style table lookup (case-insensitive).
 * Style `S` matches only a row named `S`, then returns that row's font file names.
 */
export function textStyleFontFiles(
  styleName: string,
  table: readonly CadTextStyleTableEntry[] | undefined,
): { fontFile: string; bigFontFile: string } {
  const name = styleName.trim().toLowerCase();
  if (!name || !table?.length) return { fontFile: '', bigFontFile: '' };
  const row = table.find((entry) => entry.name.trim().toLowerCase() === name);
  if (!row) return { fontFile: '', bigFontFile: '' };
  return {
    fontFile: row.font?.trim() ?? '',
    bigFontFile: row.big?.trim() ?? '',
  };
}

/** Table rows whose name appears inside an entity style (e.g. TRHEBTXT ⊃ HEBTXT). */
export function tableRowsEmbeddedInEntityStyle(
  entityStyle: string,
  table: CadTextStyleTableEntry[] | undefined,
): CadTextStyleTableEntry[] {
  if (!table?.length) return [];
  const el = entityStyle.trim().toLowerCase();
  if (!el) return [];
  const hits: CadTextStyleTableEntry[] = [];
  for (const row of table) {
    const tn = row.name.trim().toLowerCase();
    if (tn.length < 3) continue;
    if (el === tn) continue;
    if (el.includes(tn)) hits.push(row);
  }
  hits.sort((a, b) => b.name.length - a.name.length);
  return hits;
}

export type EntityTextStyleDiagnostic = {
  style: string;
  count: number;
  inTextStyleTable: boolean;
  embeddedTableRows: string[];
  prefixVariants: string[];
  /** Why the style likely never appears in `textStyleTable` JSON. */
  likelySource: 'host_table' | 'xref_or_block_style' | 'unknown';
};

export function collectEntityTextStyleDiagnostics(input: {
  texts: ReadonlyArray<{ style?: string | number }>;
  textStyleTable?: CadTextStyleTableEntry[];
}): EntityTextStyleDiagnostic[] {
  const tableNames = new Set(
    (input.textStyleTable ?? []).map((r) => r.name.trim().toLowerCase()).filter(Boolean),
  );
  const counts = new Map<string, number>();
  for (const tx of input.texts) {
    const name = tx.style != null ? String(tx.style).trim() : '';
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const rows: EntityTextStyleDiagnostic[] = [];
  for (const [style, count] of counts) {
    const inTable = tableNames.has(style.toLowerCase());
    const embedded = tableRowsEmbeddedInEntityStyle(style, input.textStyleTable).map((r) => r.name);
    const prefixVariants = entityStyleFontNameCandidates(style).filter((v) => v !== style);
    let likelySource: EntityTextStyleDiagnostic['likelySource'] = 'unknown';
    if (inTable) likelySource = 'host_table';
    else if (embedded.length > 0 || prefixVariants.length > 0) {
      likelySource = 'xref_or_block_style';
    }
    rows.push({
      style,
      count,
      inTextStyleTable: inTable,
      embeddedTableRows: embedded,
      prefixVariants,
      likelySource,
    });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}
