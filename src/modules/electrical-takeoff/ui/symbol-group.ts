/**
 * Group plan detections that represent the same symbol so one legend correction
 * can be applied together.
 *
 * A plan mark keeps its own mask signature. Marks that came from one unread
 * legend row share the legend key (`L7`, `legendKey`, or `block:…`) even when
 * those signatures differ. A shared signature still groups shape clusters and
 * block inserts. `UNK` and technical ids stay alone.
 */
export interface SymbolGroupDetection {
  readonly id: string;
  readonly sheetKey: string;
  readonly rawClass?: string | null;
  readonly tagText?: string | null;
  readonly signature?: string | null;
  readonly legendKey?: string | null;
  readonly reasons?: readonly string[];
}

const SIGNATURE_GROUP_TAG = /^סמל ללא סווג(?:\s*#\d+)?$/u;
const LEGEND_ROW_KEY = /^L\d+$/i;
const BLOCK_LEGEND_KEY = /^block:/i;
const SHAPE_CLUSTER = /^C\d+$/;

const NOT_A_SYMBOL_IDENTITY = new Set([
  'unk',
  'drawing_noise',
  'legend_margin',
  'user',
  'manual',
  'none',
  'scrap',
]);

function ignoredIdentity(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  return (
    NOT_A_SYMBOL_IDENTITY.has(raw.toLowerCase()) ||
    /^p\d+#\d+$/i.test(raw) ||
    raw.startsWith('symbol group') ||
    raw.startsWith('סמל ללא')
  );
}

/** Legend row key stamped by the worker. Null when this mark is not a legend match. */
export function legendIdentity(detection: SymbolGroupDetection): string | null {
  const explicit = detection.legendKey?.trim() ?? '';
  if (explicit && !ignoredIdentity(explicit)) return explicit;
  const raw = detection.rawClass?.trim() ?? '';
  if (!raw || ignoredIdentity(raw) || SHAPE_CLUSTER.test(raw)) return null;
  if (LEGEND_ROW_KEY.test(raw) || BLOCK_LEGEND_KEY.test(raw)) return raw;
  if (detection.reasons?.includes('legend_unmapped')) return raw;
  return null;
}

function legendToken(key: string): string {
  return `legend:${key.toLowerCase()}`;
}

export function symbolGroupKeys(detection: SymbolGroupDetection): string[] {
  if (detection.reasons?.includes('drawing_noise')) return [`solo:${detection.id}`];
  const keys: string[] = [];
  const signature = detection.signature?.trim() ?? '';
  if (signature) keys.push(`signature:${signature}`);

  const legend = legendIdentity(detection);
  if (legend) keys.push(legendToken(legend));

  const tag = detection.tagText?.trim() ?? '';
  if (!signature && SIGNATURE_GROUP_TAG.test(tag)) {
    keys.push(`sheet-signature:${detection.sheetKey}:${tag}`);
  }

  const raw = detection.rawClass?.trim() ?? '';
  const rawIsLegend = legend !== null && raw.toLowerCase() === legend.toLowerCase();
  if (!signature && raw && !rawIsLegend && !ignoredIdentity(raw)) {
    if (SHAPE_CLUSTER.test(raw)) keys.push(`sheet-cluster:${detection.sheetKey}:${raw}`);
    else keys.push(`symbol:${raw}`);
  }

  if (keys.length === 0) keys.push(`solo:${detection.id}`);
  return keys;
}

/** Primary key. Prefer {@link sameSymbolDetections} when a mark has both a signature and a legend key. */
export function symbolGroupKey(detection: SymbolGroupDetection): string {
  return symbolGroupKeys(detection)[0] ?? `solo:${detection.id}`;
}

/**
 * Stable token for "this is the same symbol" without unique per-mark UI signatures.
 * DWG blocks keep `signature:block:14e`; legend rows keep `legend:l1`.
 */
export function sharedSymbolToken(detection: SymbolGroupDetection): string {
  const keys = symbolGroupKeys(detection).filter((key) => !key.startsWith('solo:'));
  const legend = keys.find((key) => key.startsWith('legend:'));
  if (legend) return legend;
  const block = keys.find((key) => key.startsWith('signature:') && !key.startsWith('signature:ui:'));
  if (block) return block;
  const symbol = keys.find((key) => key.startsWith('symbol:') || key.startsWith('sheet-cluster:') || key.startsWith('sheet-signature:'));
  if (symbol) return symbol;
  return keys[0] ?? `solo:${detection.id}`;
}

export function sameSymbolDetections<T extends SymbolGroupDetection>(selected: T, all: readonly T[]): T[] {
  if (selected.reasons?.includes('drawing_noise')) return [selected];
  const keys = new Set(symbolGroupKeys(selected).filter((key) => !key.startsWith('solo:')));
  if (keys.size === 0) return [selected];
  return all.filter((detection) => {
    if (detection.reasons?.includes('drawing_noise')) return false;
    return symbolGroupKeys(detection).some((key) => keys.has(key));
  });
}

export interface UndecodedLegendExemplar {
  readonly legendKey: string;
  readonly exemplarId: string | null;
  /** Plan marks for this legend key. Zero when the symbol exists only in the legend. */
  readonly count: number;
}

/**
 * One selectable row per legend key the worker left without a type.
 * The exemplar is a plan detection, so applying a type can reach every match.
 */
export function undecodedLegendExemplars<T extends SymbolGroupDetection & { typeKey?: string | null }>(
  detections: readonly T[],
  extraLegendKeys: readonly string[] = [],
): UndecodedLegendExemplar[] {
  const exemplars = new Map<string, T>();
  for (const detection of detections) {
    if (detection.typeKey) continue;
    if (detection.reasons?.includes('drawing_noise') || detection.reasons?.includes('legend_zone')) continue;
    const legend = legendIdentity(detection);
    if (!legend) continue;
    const token = legend.toLowerCase();
    if (!exemplars.has(token)) exemplars.set(token, detection);
  }
  const rows: UndecodedLegendExemplar[] = [...exemplars.entries()].map(([token, exemplar]) => ({
    legendKey: legendIdentity(exemplar) ?? token,
    exemplarId: exemplar.id,
    count: sameSymbolDetections(exemplar, detections).length,
  }));
  const seen = new Set(rows.map((row) => row.legendKey.toLowerCase()));

  for (const detection of detections) {
    if (!detection.reasons?.includes('legend_zone') || detection.reasons.includes('drawing_noise')) continue;
    if (detection.typeKey) continue;
    const legend = legendIdentity(detection);
    if (!legend) continue;
    const token = legend.toLowerCase();
    if (seen.has(token)) continue;
    const planCount = sameSymbolDetections(detection, detections).filter(
      (item) => !item.reasons?.includes('legend_zone') && !item.reasons?.includes('drawing_noise'),
    ).length;
    if (planCount > 0) continue;
    seen.add(token);
    rows.push({ legendKey: legend, exemplarId: null, count: 0 });
  }

  for (const key of extraLegendKeys) {
    const legendKey = key.trim();
    if (!legendKey || seen.has(legendKey.toLowerCase())) continue;
    seen.add(legendKey.toLowerCase());
    rows.push({ legendKey, exemplarId: null, count: 0 });
  }

  return rows.sort((a, b) => a.legendKey.localeCompare(b.legendKey, 'en'));
}
