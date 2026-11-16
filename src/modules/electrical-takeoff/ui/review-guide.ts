import type { CatalogType, EffectiveDetection, ElectricalCategory, TakeoffReviewReason } from '../domain/contracts';
import { isDetectionCountable } from '../domain/counting-policy';
import { visibleDetectionReasons } from './takeoff-analysis-view';
import { sameSymbolDetections, symbolGroupKey } from './symbol-group';

/** Why a countable mark is in the guided review. Derived only from the engine fields already on the mark. */
export type ReviewKind = 'missingType' | 'confirmType' | 'uncertain';

const UNCERTAIN_REASONS = new Set<TakeoffReviewReason>([
  'type_ambiguous',
  'possible_duplicate',
  'pdf_dwg_mismatch',
  'pdf_only',
  'dwg_only',
  'xref_missing',
  'dynamic_block_unresolved',
  'tag_unread',
  'overlapping_symbols_peeled',
  'possible_exploded_symbol',
  'legend_unmapped',
]);

export const CATALOG_CATEGORY_ORDER: readonly ElectricalCategory[] = [
  'lighting',
  'emergency_lighting',
  'power',
  'control',
  'communication',
  'low_voltage',
  'fire_detection',
  'panels_distribution',
  'conduit_tray',
  'other',
  'unknown',
];

export type ReviewGroup = {
  key: string;
  kind: ReviewKind;
  typeKey: string | null;
  detectionIds: string[];
  focusId: string;
  occurrences: number;
  reasons: TakeoffReviewReason[];
};

export type TypeSuggestion = {
  typeKey: string;
  source: 'library' | 'sameSymbol';
};

const IGNORED_SYMBOL = /^(unk|unknown|user|manual|none|drawing_noise|legend_margin)$/i;

export function needsGuidedReview(detection: EffectiveDetection): boolean {
  if (!isDetectionCountable(detection)) return false;
  if (detection.reasons.includes('drawing_noise') || detection.reasons.includes('legend_zone')) return false;
  return detection.needsReview || detection.typeKey == null;
}

export function reviewKind(detection: EffectiveDetection): ReviewKind | null {
  if (!needsGuidedReview(detection)) return null;
  if (!detection.typeKey) return 'missingType';
  if (detection.reasons.some((reason) => UNCERTAIN_REASONS.has(reason))) return 'uncertain';
  return 'confirmType';
}

/** Block name or legend key already stored on the mark. Nothing is inferred from the drawing. */
export function symbolIdentityLabel(
  detection: { rawClass: string },
): { kind: 'block' | 'legend'; value: string } | null {
  const raw = detection.rawClass.trim();
  if (!raw || IGNORED_SYMBOL.test(raw) || /^p\d+#\d+$/i.test(raw) || /^C\d+$/.test(raw)) return null;
  if (/^L\d+$/i.test(raw)) return { kind: 'legend', value: raw };
  const value = raw.replace(/^block:/i, '').trim();
  if (!value) return null;
  return { kind: 'block', value };
}

/**
 * One step per identical symbol group. Marks that share a block but differ in type or review reason
 * stay in separate groups, so a classification cannot spill onto them.
 */
export function buildReviewGroups(detections: readonly EffectiveDetection[]): ReviewGroup[] {
  const pending = detections
    .filter(needsGuidedReview)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const used = new Set<string>();
  const groups: ReviewGroup[] = [];
  for (const detection of pending) {
    if (used.has(detection.id)) continue;
    const kind = reviewKind(detection);
    if (!kind) continue;
    const mates = sameSymbolDetections(detection, detections)
      .filter((item) => reviewKind(item) === kind && item.typeKey === detection.typeKey)
      .sort((a, b) => a.id.localeCompare(b.id, 'en'));
    for (const mate of mates) used.add(mate.id);
    const reasons = new Set<TakeoffReviewReason>();
    for (const mate of mates) {
      for (const reason of visibleDetectionReasons(mate)) reasons.add(reason);
    }
    groups.push({
      key: `${kind}::${detection.typeKey ?? ''}::${symbolGroupKey(detection)}`,
      kind,
      typeKey: detection.typeKey,
      detectionIds: mates.map((mate) => mate.id),
      focusId: mates[0]?.id ?? detection.id,
      occurrences: mates.length,
      reasons: [...reasons],
    });
  }
  const rank: Record<ReviewKind, number> = { missingType: 0, uncertain: 1, confirmType: 2 };
  return groups.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || b.occurrences - a.occurrences || a.key.localeCompare(b.key, 'en'),
  );
}

export function reviewProgress(
  seen: ReadonlySet<string>,
  groups: readonly { key: string }[],
): { checked: number; total: number } {
  const open = new Set(groups.map((group) => group.key));
  let checked = 0;
  for (const key of seen) {
    if (!open.has(key)) checked += 1;
  }
  return { checked, total: seen.size };
}

/** A suggestion is an existing catalog type already tied to this signature or to the same symbol. */
export function typeSuggestions(
  focus: EffectiveDetection,
  all: readonly EffectiveDetection[],
  library: readonly { signature: string; typeKey: string }[],
  catalogKeys: ReadonlySet<string>,
): TypeSuggestion[] {
  const out: TypeSuggestion[] = [];
  const seen = new Set<string>();
  const add = (typeKey: string, source: TypeSuggestion['source']) => {
    if (!catalogKeys.has(typeKey) || seen.has(`${source}:${typeKey}`)) return;
    seen.add(`${source}:${typeKey}`);
    out.push({ typeKey, source });
  };
  const signature = focus.signature?.trim();
  if (signature) {
    const keys = [...new Set(library.filter((entry) => entry.signature === signature).map((entry) => entry.typeKey))];
    if (keys.length === 1 && keys[0]) add(keys[0], 'library');
  }
  const siblingTypes = [
    ...new Set(
      sameSymbolDetections(focus, all)
        .filter((item) => item.id !== focus.id && item.typeKey)
        .map((item) => item.typeKey as string),
    ),
  ];
  if (siblingTypes.length === 1 && siblingTypes[0]) add(siblingTypes[0], 'sameSymbol');
  return out;
}

export function filterCatalog(
  catalog: readonly CatalogType[],
  category: 'all' | ElectricalCategory,
  query: string,
  selectedKey: string,
): CatalogType[] {
  const q = query.trim().toLowerCase();
  const rows = catalog.filter((type) => {
    if (category !== 'all' && type.category !== category) return false;
    if (!q) return true;
    return type.nameHe.toLowerCase().includes(q) || type.key.toLowerCase().includes(q);
  });
  if (selectedKey && !rows.some((type) => type.key === selectedKey)) {
    const selected = catalog.find((type) => type.key === selectedKey);
    if (selected) return [selected, ...rows];
  }
  return rows;
}

export function groupCatalog(types: readonly CatalogType[]): { category: ElectricalCategory; types: CatalogType[] }[] {
  return CATALOG_CATEGORY_ORDER.map((category) => ({
    category,
    types: types.filter((type) => type.category === category),
  })).filter((group) => group.types.length > 0);
}
