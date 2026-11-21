import type {
  Boq,
  BoqLine,
  DetectionOrigin,
  EffectiveDetection,
  IdentitySource,
  TakeoffReviewReason,
  WorkerDetection,
  WorkerLegendEntry,
} from './contracts';
import { deriveNeedsReview } from './edits';

export type { IdentitySource };

export type LegendHoldReason =
  | 'none'
  | 'conflict'
  | 'unread'
  | 'weak_match'
  | 'sheet_unassigned'
  | 'note';

export type LegendIdentity = {
  source: IdentitySource;
  originalText: string | null;
  displayName: string | null;
  legendRowId: string | null;
  unambiguous: boolean;
  holdReason: LegendHoldReason;
};

const NOTE_MARKERS = ['בקומות', 'גישור', 'כבל', 'מעבר', 'קומה'] as const;
const HEBREW = /[\u0590-\u05FF]/;

/** Reasons that still require a person even when the legend text is unique. */
export const LEGEND_HOLD_REASONS: ReadonlySet<TakeoffReviewReason> = new Set([
  'type_ambiguous',
  'possible_duplicate',
  'pdf_dwg_mismatch',
  'sheet_unassigned',
  'xref_missing',
  'legend_text_undecodable',
  'dynamic_block_unresolved',
]);

type LegendRow = Pick<
  WorkerLegendEntry,
  'key' | 'signature' | 'decodedText' | 'rawText' | 'decodedBy' | 'reasons' | 'continuation'
>;

export function normalizeLegendDisplayText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function legendRowDisplayText(row: Pick<LegendRow, 'decodedText' | 'rawText'>): string | null {
  const decoded = row.decodedText?.trim();
  if (decoded) return normalizeLegendDisplayText(decoded);
  const raw = row.rawText?.trim();
  if (raw) return normalizeLegendDisplayText(raw);
  return null;
}

export function isLegendNoteText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^\s*כמות\b/.test(trimmed)) return true;
  return NOTE_MARKERS.some((marker) => trimmed.includes(marker));
}

function isUnreadLegendRow(row: LegendRow, text: string): boolean {
  if ((row.reasons ?? []).includes('legend_text_undecodable')) return true;
  if (row.decodedBy === 'none') return true;
  if (!HEBREW.test(text) && /[a-z]{4,}/i.test(text)) return true;
  return false;
}

function legendIndex(legend: readonly LegendRow[]): {
  byKey: Map<string, LegendRow>;
  bySignature: Map<string, LegendRow[]>;
} {
  const byKey = new Map<string, LegendRow>();
  const bySignature = new Map<string, LegendRow[]>();
  for (const row of legend) {
    if (row.continuation) continue;
    byKey.set(row.key, row);
    const sig = row.signature?.trim();
    if (!sig) continue;
    const list = bySignature.get(sig) ?? [];
    list.push(row);
    bySignature.set(sig, list);
    const lower = sig.toLowerCase();
    if (lower !== sig) {
      const extra = bySignature.get(lower) ?? [];
      extra.push(row);
      bySignature.set(lower, extra);
    }
  }
  return { byKey, bySignature };
}

function rowIdsForDetection(
  detection: Pick<EffectiveDetection, 'legendRowIds' | 'legendKey' | 'signature'>,
  index: ReturnType<typeof legendIndex>,
): string[] {
  if (detection.legendRowIds && detection.legendRowIds.length > 0) return detection.legendRowIds;
  if (detection.legendKey?.trim()) return [detection.legendKey.trim()];
  // Older payloads had no legendRowIds; use the worker signature already stored on the mark.
  if (detection.legendRowIds && detection.legendRowIds.length === 0) return [];
  const sig = detection.signature?.trim();
  if (!sig) return [];
  const rows = index.bySignature.get(sig) ?? index.bySignature.get(sig.toLowerCase()) ?? [];
  return rows.map((row) => row.key);
}

function sourceFromOrigin(
  origin: DetectionOrigin | undefined,
  classifiedBy: WorkerDetection['classifiedBy'] | undefined,
  unambiguousLegend: boolean,
  typeKey: string | null,
): IdentitySource {
  if ((origin === 'user_changed' || origin === 'user_added') && typeKey) return 'manual';
  if (classifiedBy === 'library' && typeKey) return 'library';
  if (unambiguousLegend) return 'legend';
  if (typeKey) return 'catalog';
  return 'uncertain';
}

export function resolveLegendIdentity(
  detection: Pick<
    EffectiveDetection,
    'legendRowIds' | 'legendKey' | 'signature' | 'reasons' | 'typeKey' | 'origin'
  > & { classifiedBy?: WorkerDetection['classifiedBy'] },
  legend: readonly LegendRow[],
  index = legendIndex(legend),
): LegendIdentity {
  const empty = (hold: LegendHoldReason, source: IdentitySource = 'uncertain'): LegendIdentity => ({
    source,
    originalText: null,
    displayName: null,
    legendRowId: null,
    unambiguous: false,
    holdReason: hold,
  });

  if (detection.reasons.includes('sheet_unassigned')) {
    const nested = resolveLegendIdentity(
      { ...detection, reasons: detection.reasons.filter((reason) => reason !== 'sheet_unassigned') },
      legend,
      index,
    );
    return { ...nested, unambiguous: false, holdReason: 'sheet_unassigned', source: 'uncertain' };
  }

  const ids = rowIdsForDetection(detection, index);
  if (ids.length === 0) {
    const source = sourceFromOrigin(detection.origin, detection.classifiedBy, false, detection.typeKey);
    return empty(detection.typeKey ? 'none' : 'weak_match', source);
  }

  const unique = new Map<string, { text: string; key: string }>();
  let unread = false;
  let sawNote = false;
  let sawDescription = false;
  for (const id of ids) {
    const row = index.byKey.get(id);
    if (!row) continue;
    const text = legendRowDisplayText(row);
    if (!text) {
      unread = true;
      continue;
    }
    if (isUnreadLegendRow(row, text)) {
      unread = true;
      continue;
    }
    if (isLegendNoteText(text)) {
      sawNote = true;
      continue;
    }
    sawDescription = true;
    if (!unique.has(text)) unique.set(text, { text, key: row.key });
  }

  if (unique.size > 1 || detection.reasons.includes('type_ambiguous')) {
    const first = unique.values().next().value as { text: string; key: string } | undefined;
    return {
      source: 'uncertain',
      originalText: first?.text ?? null,
      displayName: unique.size === 1 ? first?.text ?? null : null,
      legendRowId: unique.size === 1 ? first?.key ?? null : null,
      unambiguous: false,
      holdReason: 'conflict',
    };
  }

  if (unique.size === 0) {
    const source = sourceFromOrigin(detection.origin, detection.classifiedBy, false, detection.typeKey);
    return empty(unread ? 'unread' : sawNote && !sawDescription ? 'note' : 'weak_match', source);
  }

  const only = unique.values().next().value as { text: string; key: string };
  const hold = detection.reasons.some((reason) => LEGEND_HOLD_REASONS.has(reason))
    ? detection.reasons.includes('sheet_unassigned')
      ? 'sheet_unassigned'
      : 'conflict'
    : 'none';
  const unambiguous = hold === 'none';
  const source = sourceFromOrigin(detection.origin, detection.classifiedBy, unambiguous, detection.typeKey);
  return {
    source,
    originalText: only.text,
    displayName: only.text,
    legendRowId: only.key,
    unambiguous,
    holdReason: hold,
  };
}

export function hasLegendQuantityIdentity(
  detection: Pick<EffectiveDetection, 'identitySource' | 'originalText' | 'legendUnambiguous'>,
): boolean {
  return Boolean(detection.legendUnambiguous && detection.originalText);
}

export function enrichDetectionsWithLegendIdentity(
  detections: readonly EffectiveDetection[],
  legend: readonly LegendRow[],
  options?: { classifiedByById?: ReadonlyMap<string, WorkerDetection['classifiedBy']> },
): EffectiveDetection[] {
  const index = legendIndex(legend);
  return detections.map((detection) => {
    const classifiedBy = detection.classifiedBy ?? options?.classifiedByById?.get(detection.id);
    const identity = resolveLegendIdentity({ ...detection, classifiedBy }, legend, index);
    const userChangedType = detection.origin === 'user_changed';
    const needsReview = deriveNeedsReview({
      reasons: detection.reasons,
      confidence: detection.confidence,
      typeKey: detection.typeKey,
      status: detection.status,
      userChangedType,
      legendUnambiguous: identity.unambiguous,
    });
    return {
      ...detection,
      classifiedBy,
      identitySource: identity.source,
      originalText: identity.originalText,
      legendLabel: identity.displayName,
      legendUnambiguous: identity.unambiguous,
      needsReview,
    };
  });
}

export function isQuantityIdentityLine(
  line: Pick<BoqLine, 'excluded' | 'quantity' | 'typeKey' | 'identitySource'>,
): boolean {
  if (line.excluded || line.quantity <= 0) return false;
  if (line.typeKey != null) return true;
  return line.identitySource === 'legend' || line.identitySource === 'library' || line.identitySource === 'manual';
}

export function takeoffBoqApprovalBlocked(
  boq: Pick<Boq, 'unclassifiedCount' | 'needsReviewCount' | 'lines'>,
): boolean {
  return boq.unclassifiedCount > 0 || boq.needsReviewCount > 0 || !boq.lines.some(isQuantityIdentityLine);
}

export type LegendIdentityMetrics = {
  geometric: number;
  withLegendMatch: number;
  unambiguousLegend: number;
  catalogTyped: number;
  legendWithoutCatalog: number;
  unidentified: number;
  reviewGroups: number;
};

export function measureLegendIdentity(
  detections: readonly EffectiveDetection[],
  countable: (detection: EffectiveDetection) => boolean,
  reviewGroupCount: (detections: readonly EffectiveDetection[]) => number,
): LegendIdentityMetrics {
  const rows = detections.filter(countable);
  let withLegendMatch = 0;
  let unambiguousLegend = 0;
  let catalogTyped = 0;
  let legendWithoutCatalog = 0;
  let unidentified = 0;
  for (const row of rows) {
    if ((row.legendRowIds && row.legendRowIds.length > 0) || row.legendKey || row.originalText) withLegendMatch += 1;
    if (row.identitySource === 'legend' && row.originalText) unambiguousLegend += 1;
    if (row.typeKey) catalogTyped += 1;
    if (row.identitySource === 'legend' && !row.typeKey) legendWithoutCatalog += 1;
    if (!row.typeKey && row.identitySource !== 'legend') unidentified += 1;
  }
  return {
    geometric: rows.length,
    withLegendMatch,
    unambiguousLegend,
    catalogTyped,
    legendWithoutCatalog,
    unidentified,
    reviewGroups: reviewGroupCount(detections),
  };
}
