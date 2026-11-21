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
  | 'note'
  | 'linear'
  | 'site_work';

export type LegendTextKind = 'device' | 'linear' | 'note' | 'site_work';

export type LegendIdentity = {
  source: IdentitySource;
  originalText: string | null;
  displayName: string | null;
  legendRowId: string | null;
  unambiguous: boolean;
  holdReason: LegendHoldReason;
};

const NOTE_MARKERS = ['בקומות', 'גישור', 'מעבר', 'קומה'] as const;
const HEBREW = /[\u0590-\u05FF]/;
const DEVICE_NOUN =
  /שקע|בית\s*תקע|מפסק|מפסח|לחצן|נקוד(?:ה|ת)?\s*(?:מאור|תאור|חשמל|טלפון|תקשורת|כח|כוח)|נקודה\s+ל|גוף(?:\s*תאור)?|ג["״']?ת\b|תאורת|חיישן|פעמון|מאור|חירום|תריס|פנדל|לוח|ממסר|מנתק|מאריך|קופס|גלאי|מאוורר|שנאי|ממיר|דוד/;
const LINEAR_CODE = /\bN2XY\b|\bN2XH\b|\bN2XSY\b|\bNHXMH\b|\bNYY\b|\bNYM\b|\bXLPE\b|\+\s*\d+\s*CU\b/i;
const LINEAR_WORD = /כבל|מוליך|תעלה|צנרת|מגש|שרוול/;
const CROSS_SECTION = /\(\s*\d+\s*[xX×]\s*\d+(?:\.\d+)?|\b\d+\s*[xX×]\s*\d+(?:\.\d+)?(?:\s*(?:mm|ממ))/i;
const MANUFACTURER = /תוצרת|יצרן|לפי מפרט|בתאום עם/;
/** Earth / weld / bonding work — countable in units only after the match is confirmed. */
const SITE_WORK =
  /ריתוך|הארקת\s*יסוד|טבעת\s*הארק|פס\s*הארק|שו[וו]ה\s*פוטנציאל|אלקטרודת\s*הארק|מהדק\s*הארק/;
/** Installation notes that mention a device in passing are not a quantity line. */
const INSTRUCTION_PREFIX =
  /^(?:מיקום סופי|במידה\s*ו|הכנה\s+ל|גובה אותיות|יש להתקין|לפי תוכנית|עפ["״']י תוכנית)/;

/**
 * Reasons that still require a person even when the legend text is unique.
 * Catalog-family `type_ambiguous` is not a legend conflict.
 */
export const LEGEND_HOLD_REASONS: ReadonlySet<TakeoffReviewReason> = new Set([
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

export function classifyLegendText(text: string): LegendTextKind {
  const trimmed = normalizeLegendDisplayText(text);
  if (!trimmed) return 'note';
  if (/^\s*כמות\b/.test(trimmed)) return 'note';
  if (INSTRUCTION_PREFIX.test(trimmed)) return 'note';
  if (SITE_WORK.test(trimmed)) return 'site_work';
  const hasDevice = DEVICE_NOUN.test(trimmed);
  const hasLinear = LINEAR_WORD.test(trimmed) || LINEAR_CODE.test(trimmed) || CROSS_SECTION.test(trimmed);
  if (hasDevice) return 'device';
  if (hasLinear) return 'linear';
  if (NOTE_MARKERS.some((marker) => trimmed.includes(marker)) || MANUFACTURER.test(trimmed)) return 'note';
  return 'device';
}

export function isLegendNoteText(text: string): boolean {
  return classifyLegendText(text) === 'note';
}

export function isLegendLinearText(text: string): boolean {
  return classifyLegendText(text) === 'linear';
}

export function isLegendHoldText(text: string): boolean {
  return classifyLegendText(text) !== 'device';
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
  if (unambiguousLegend) return 'legend';
  if (classifiedBy === 'library' && typeKey) return 'library';
  if (typeKey) return 'catalog';
  return 'uncertain';
}

/** Planner wording for BOQ / lists: a manual name wins, then the legend sentence. */
export function plannerItemName(detection: {
  userLabel?: string | null;
  originalText?: string | null;
  legendLabel?: string | null;
}): string | null {
  const name =
    detection.userLabel?.trim() || detection.originalText?.trim() || detection.legendLabel?.trim() || '';
  return name || null;
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
  let sawLinear = false;
  let sawSiteWork = false;
  let sawDescription = false;
  let held: { text: string; key: string; kind: Exclude<LegendTextKind, 'device'> } | null = null;
  for (const id of ids) {
    const row = index.byKey.get(id);
    if (!row) continue;
    const text = legendRowDisplayText(row);
    if (!text) {
      unread = true;
      continue;
    }
    const kind = classifyLegendText(text);
    if (kind !== 'device') {
      if (kind === 'note') sawNote = true;
      else if (kind === 'linear') sawLinear = true;
      else sawSiteWork = true;
      held ??= { text, key: row.key, kind };
      continue;
    }
    if (isUnreadLegendRow(row, text)) {
      unread = true;
      continue;
    }
    sawDescription = true;
    if (!unique.has(text)) unique.set(text, { text, key: row.key });
  }

  if (unique.size > 1) {
    const first = unique.values().next().value as { text: string; key: string } | undefined;
    return {
      source: 'uncertain',
      originalText: first?.text ?? null,
      displayName: null,
      legendRowId: null,
      unambiguous: false,
      holdReason: 'conflict',
    };
  }

  if (unique.size === 0) {
    const source = sourceFromOrigin(detection.origin, detection.classifiedBy, false, detection.typeKey);
    if (held && (sawLinear || sawNote || sawSiteWork) && !sawDescription) {
      return {
        source,
        originalText: held.text,
        displayName: held.text,
        legendRowId: held.key,
        unambiguous: false,
        holdReason: held.kind,
      };
    }
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

function normalizedSymbolSignature(signature: string | null | undefined): string {
  return (signature ?? '').replace(/^block:/i, '').trim().toLowerCase();
}

function mixedSignatureLegendRows(
  detections: readonly Pick<EffectiveDetection, 'legendRowIds' | 'signature'>[],
): Set<string> {
  const signatures = new Map<string, Set<string>>();
  for (const detection of detections) {
    const signature = normalizedSymbolSignature(detection.signature);
    if (!signature) continue;
    for (const id of detection.legendRowIds ?? []) {
      const set = signatures.get(id) ?? new Set<string>();
      set.add(signature);
      signatures.set(id, set);
    }
  }
  const mixed = new Set<string>();
  for (const [id, set] of signatures) {
    if (set.size > 1) mixed.add(id);
  }
  return mixed;
}

function detectionMatchesLegendRowSignature(
  detection: Pick<EffectiveDetection, 'signature'>,
  row: LegendRow | undefined,
): boolean {
  const detectionSignature = normalizedSymbolSignature(detection.signature);
  const rowSignature = normalizedSymbolSignature(row?.signature);
  return Boolean(detectionSignature && rowSignature && detectionSignature === rowSignature);
}

export function enrichDetectionsWithLegendIdentity(
  detections: readonly EffectiveDetection[],
  legend: readonly LegendRow[],
  options?: { classifiedByById?: ReadonlyMap<string, WorkerDetection['classifiedBy']> },
): EffectiveDetection[] {
  const index = legendIndex(legend);
  const mixedRows = mixedSignatureLegendRows(detections);
  return detections.map((detection) => {
    const classifiedBy = detection.classifiedBy ?? options?.classifiedByById?.get(detection.id);
    let identity = resolveLegendIdentity({ ...detection, classifiedBy }, legend, index);
    if (
      identity.unambiguous &&
      identity.legendRowId &&
      mixedRows.has(identity.legendRowId) &&
      !detectionMatchesLegendRowSignature(detection, index.byKey.get(identity.legendRowId))
    ) {
      identity = {
        ...identity,
        unambiguous: false,
        holdReason: 'conflict',
        source: 'uncertain',
      };
    }
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
      legendHoldReason: identity.holdReason,
      needsReview,
    };
  });
}

const UNDETERMINED_QUANTITY_RULE_IDS = new Set(['legend-linear', 'legend-note', 'legend-site-work']);

export function isUndeterminedQuantityLine(
  line: Pick<BoqLine, 'ruleId' | 'verified' | 'quantity' | 'identitySource'>,
): boolean {
  if (line.verified) return false;
  if (line.ruleId && UNDETERMINED_QUANTITY_RULE_IDS.has(line.ruleId)) return true;
  return line.identitySource === 'uncertain' && line.quantity <= 0;
}

/** Display for BOQ / export. Never show 0 as if the work is absent. */
export function boqQuantityDisplay(line: Pick<BoqLine, 'ruleId' | 'verified' | 'quantity' | 'identitySource'>): string {
  return isUndeterminedQuantityLine(line) ? '—' : String(line.quantity);
}

export function undeterminedQuantityRemarkHe(
  kind: LegendTextKind,
  symbolCount: number,
): string {
  if (kind === 'linear') {
    return `כמות לא נקבעה — חסר אורך מדיד במטרים. ${symbolCount} מופעי CAD הם ראיה בלבד, לא אורך הכבל.`;
  }
  if (kind === 'site_work') {
    return `כמות לא נקבעה — נדרש אישור שהסמל הוא פריט העבודה. ${symbolCount} מופעי CAD הם ראיה, לא כמות מאושרת.`;
  }
  return 'כמות לא נקבעה — הערה או פרט יצרן, לא שורת כמות.';
}

export function isQuantityIdentityLine(
  line: Pick<BoqLine, 'excluded' | 'quantity' | 'typeKey' | 'identitySource' | 'ruleId' | 'verified'>,
): boolean {
  if (line.excluded || isUndeterminedQuantityLine(line) || line.quantity <= 0) return false;
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
