import type {
  Boq,
  BoqLine,
  BoqLineKind,
  CatalogType,
  EffectiveDetection,
  MeasurementRule,
  MeasurementRuleSet,
  SheetDto,
  TakeoffArea,
  WorkerDetection,
  WorkerLinear,
} from './contracts';
import { devicesFromNote } from './quantity-notes';
import { parseSheetRefId } from './sheet-selection';
import {
  BOQ_WARNING_DRAFT,
  BOQ_WARNING_NEEDS_REVIEW,
  BOQ_WARNING_PARTIAL_SHEET,
  BOQ_WARNING_SCALE_UNVERIFIED,
  BOQ_WARNING_SKIPPED_SHEET,
  BOQ_WARNING_UNCLASSIFIED,
  BOQ_WARNING_PDF_DWG_UNPAIRED,
  BOQ_WARNING_PDF_ONLY_NOT_COUNTED,
  BOQ_WARNING_XREF_MISSING,
} from './boq-warnings';
import {
  countedBySource,
  isDetectionCountable,
  pickTwinRepresentative,
  summarizeExclusions,
} from './counting-policy';
import { applyUnpairedPdfPolicy } from './unpaired-pdf-policy';
import { catalogByKey } from './catalog';
import { distancePx } from './geometry';
import { resolveRuleForType, roleToLineKind } from './measurement';

export type ComputeBoqInput = {
  readonly detections: readonly EffectiveDetection[];
  /** Worker base rows — used to detect real PDF↔DWG merge vs orphan twinIds. */
  readonly workerDetections?: readonly WorkerDetection[];
  readonly sheets: readonly SheetDto[];
  readonly areas: readonly TakeoffArea[];
  readonly catalog: readonly CatalogType[];
  readonly ruleSet: MeasurementRuleSet;
  readonly linear: readonly WorkerLinear[];
  readonly state: 'draft' | 'approved';
  /** From worker base detections — used to collapse PDF/DWG twins (one count per twinId). */
  readonly twinIdByDetectionId?: ReadonlyMap<string, string | undefined>;
  readonly floorBySheet?: ReadonlyMap<string, string | null>;
  /** `fileId:sheetKey` refs included in quantities; omit = all sheets count. */
  readonly includedSheetRefIds?: ReadonlySet<string>;
  /** Maps detection id → ingest fileId for scoped sheet refs. */
  readonly detectionFileIdById?: ReadonlyMap<string, string>;
  /** From worker stats (`merge_matched_pairs`) — gates BOQ PDF exclusion when pairing/merge was not real. */
  readonly mergeMatchedPairs?: number;
};

type CountableDetection = EffectiveDetection & { readonly floor: string | null };

export function computeBoq(input: ComputeBoqInput): Boq {
  const catalogMap = catalogByKey(input.catalog);
  const warnings: string[] = [];
  const floorBySheet = input.floorBySheet ?? buildFloorMap(input.sheets);

  if (input.state !== 'approved') warnings.push(BOQ_WARNING_DRAFT);

  const twinMap = input.twinIdByDetectionId ?? new Map();
  const { detections: policyApplied, unpairedPdfTagged } = applyUnpairedPdfPolicy(
    input.detections,
    input.sheets,
    twinMap,
    input.workerDetections,
    input.detectionFileIdById,
    input.mergeMatchedPairs,
  );
  const { scopedDetections, sheetExcludedCount } = scopeDetectionsForBoq({
    ...input,
    detections: policyApplied,
  });
  const completeness = buildCompleteness(input.sheets, warnings);
  const exclusions = summarizeExclusions(scopedDetections);
  if (unpairedPdfTagged > 0) {
    warnings.push(BOQ_WARNING_PDF_DWG_UNPAIRED(unpairedPdfTagged));
  }
  if (exclusions.pdfOnly > 0) {
    warnings.push(BOQ_WARNING_PDF_ONLY_NOT_COUNTED(exclusions.pdfOnly));
  }

  const preTwinCountable = scopedDetections.filter((d) => isDetectionCountable(d));
  const countable = selectCountableDetections(scopedDetections, twinMap);
  const twinsCollapsed = Math.max(0, preTwinCountable.length - countable.length);
  const bySource = countedBySource(countable);
  let hiddenLayerEstimate = 0;
  for (const s of input.sheets) hiddenLayerEstimate += s.hiddenByLayers;

  const withFloor: CountableDetection[] = countable.map((d) => ({
    ...d,
    floor: floorBySheet.get(d.sheetKey) ?? input.sheets.find((s) => s.sheetKey === d.sheetKey)?.floorHint ?? null,
  }));

  const lines: BoqLine[] = [];
  const usedRuleIds = new Set<string>();

  const byBucket = new Map<string, CountableDetection[]>();
  for (const d of withFloor) {
    // floor / area already on d
    if (d.typeKey === null) {
      const family = unclassifiedFamily(d.rawClass);
      const key = bucketKey('unclassified', family, d.floor, d.areaId, 'unclassified');
      const list = byBucket.get(key) ?? [];
      list.push(d);
      byBucket.set(key, list);
      continue;
    }
    const cat = catalogMap.get(d.typeKey);
    const category = cat?.category ?? 'unknown';
    const rule = resolveRuleForType(input.ruleSet.rules, d.typeKey, category);
    if (!rule) continue;
    if (rule.mode === 'exclude') {
      const key = bucketKey('excluded', d.typeKey, d.floor, d.areaId, rule.id);
      const list = byBucket.get(key) ?? [];
      list.push(d);
      byBucket.set(key, list);
      usedRuleIds.add(rule.id);
      continue;
    }
    const key = bucketKey(rule.mode, d.typeKey, d.floor, d.areaId, rule.id);
    const list = byBucket.get(key) ?? [];
    list.push(d);
    byBucket.set(key, list);
    usedRuleIds.add(rule.id);
  }

  for (const [, group] of byBucket) {
    const sample = group[0]!;
    if (sample.typeKey === null) {
      lines.push(buildUnclassifiedLine(group, unclassifiedFamily(sample.rawClass)));
      continue;
    }
    const cat = catalogMap.get(sample.typeKey);
    const category = cat?.category ?? 'unknown';
    const rule = resolveRuleForType(input.ruleSet.rules, sample.typeKey, category);
    if (!rule) continue;

    if (rule.mode === 'exclude') {
      lines.push(buildExcludedLine(group, sample, cat, rule, input.state, completeness));
      continue;
    }

    const sheet = input.sheets.find((s) => s.sheetKey === sample.sheetKey);
    const clusters = rule.mode === 'group_by_proximity'
      ? clusterByProximity(group, rule, sheet)
      : group.map((d) => [d]);

    if (rule.mode === 'group_by_proximity' && rule.proximity?.radiusMeters && sheet && !sheet.scale.verified) {
      warnings.push(BOQ_WARNING_SCALE_UNVERIFIED);
    }

    const lineKind = rule.output.lineKind ?? (cat ? roleToLineKind(cat.role) : 'device_count');
    const flatIds = clusters.flat().map((d) => d.id).sort();
    const symbolCount = group.length;
    const deviceCount = group.reduce((sum, detection) => sum + devicesFromNote(detection.tagText), 0);
    const quantity = rule.mode === 'group_by_proximity' ? clusters.length : deviceCount;
    const rep = group[0]!;
    lines.push(
      buildQuantityLine({
        cluster: group,
        typeKey: sample.typeKey,
        label: rule.output.label ?? cat?.nameHe ?? sample.typeKey,
        category: cat?.category ?? 'unknown',
        lineKind,
        unit: cat?.unit ?? "יח'",
        rule,
        floor: rep.floor,
        areaId: rep.areaId,
        state: input.state,
        completeness,
        excluded: false,
        quantityOverride: quantity,
        symbolCount,
        detectionIds: flatIds,
      }),
    );
  }

  appendLinearLines(lines, input.linear, input.catalog, input.sheets, input.state, completeness, warnings);

  const sorted = [...lines].sort((a, b) => a.key.localeCompare(b.key, 'en'));

  const needsReviewCount = countable.filter((d) => d.needsReview).length;
  const unclassifiedCount = countable.filter((d) => d.typeKey === null).length;
  if (unclassifiedCount > 0) warnings.push(BOQ_WARNING_UNCLASSIFIED);
  if (needsReviewCount > 0) warnings.push(BOQ_WARNING_NEEDS_REVIEW);

  const uniqueWarnings = [...new Set(warnings)];

  return {
    lines: sorted,
    unclassifiedCount,
    needsReviewCount,
    completeness,
    warnings: uniqueWarnings,
    state: input.state,
    counting: {
      countedTotal: countable.length,
      countedBySource: bySource,
      twinsCollapsed,
      excluded: {
        legendZone: exclusions.legendZone,
        pdfOnly: exclusions.pdfOnly,
        hiddenLayersOnSheets: hiddenLayerEstimate,
        sheetExcluded: sheetExcludedCount,
      },
      composition: {
        dwgCounted: bySource.dwg,
        pdfCounted: bySource.pdf + bySource.merged,
        unpairedPdfExcluded: exclusions.pdfOnly,
      },
    },
  };
}

function scopeDetectionsForBoq(input: ComputeBoqInput): {
  scopedDetections: readonly EffectiveDetection[];
  sheetExcludedCount: number;
} {
  const included = input.includedSheetRefIds;
  if (!included) {
    return { scopedDetections: input.detections, sheetExcludedCount: 0 };
  }
  const fileById = input.detectionFileIdById ?? new Map<string, string>();
  const includedSheetKeys = new Set([...included].map((ref) => parseSheetRefId(ref).sheetKey));
  let sheetExcludedCount = 0;
  const scoped: EffectiveDetection[] = [];
  for (const d of input.detections) {
    const fileId = fileById.get(d.id);
    const ref = fileId ? `${fileId}:${d.sheetKey}` : d.sheetKey;
    // A mark added on the open sheet has no file id. Include it when that sheet is included.
    const onIncludedSheet =
      included.has(ref) ||
      (!fileId && (included.has(d.sheetKey) || includedSheetKeys.has(d.sheetKey)));
    if (onIncludedSheet) {
      scoped.push(d);
    } else if (isDetectionCountable(d)) {
      sheetExcludedCount += 1;
    }
  }
  return { scopedDetections: scoped, sheetExcludedCount };
}

function buildFloorMap(sheets: readonly SheetDto[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const s of sheets) {
    m.set(s.sheetKey, s.floorLabel ?? s.floorHint ?? null);
  }
  return m;
}

function bucketKey(mode: string, typeKey: string | null, floor: string | null, areaId: string | null, ruleId: string): string {
  return `${mode}|${typeKey ?? 'null'}|${floor ?? ''}|${areaId ?? ''}|${ruleId}`;
}

function selectCountableDetections(
  detections: readonly EffectiveDetection[],
  twinIdByDetectionId: ReadonlyMap<string, string | undefined>,
): EffectiveDetection[] {
  const groups = new Map<string, EffectiveDetection[]>();
  for (const d of detections) {
    if (!isDetectionCountable(d)) continue;
    const twin = twinIdByDetectionId.get(d.id);
    const gkey = twin ? `twin:${twin}` : `id:${d.id}`;
    const list = groups.get(gkey) ?? [];
    list.push(d);
    groups.set(gkey, list);
  }
  const chosen: EffectiveDetection[] = [];
  for (const group of groups.values()) {
    chosen.push(pickTwinRepresentative(group));
  }
  return chosen.sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

function clusterByProximity(
  group: CountableDetection[],
  rule: MeasurementRule,
  sheet: SheetDto | undefined,
): CountableDetection[][] {
  const radiusPx = rule.proximity?.radiusPx;
  let radius = radiusPx ?? 32;
  if (rule.proximity?.radiusMeters && sheet?.scale.verified && sheet.scale.metersPerPreviewPx) {
    radius = rule.proximity.radiusMeters / sheet.scale.metersPerPreviewPx;
  } else if (rule.proximity?.radiusMeters && !sheet?.scale.verified) {
    radius = radiusPx ?? 48;
  }

  const remaining = [...group];
  const clusters: CountableDetection[][] = [];
  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const cluster = [seed];
    const keep: CountableDetection[] = [];
    for (const d of remaining) {
      if (distancePx(seed.x, seed.y, d.x, d.y) <= radius) cluster.push(d);
      else keep.push(d);
    }
    remaining.length = 0;
    remaining.push(...keep);
    clusters.push(cluster);
  }
  return clusters;
}

function buildBreakdown(cluster: readonly EffectiveDetection[]): BoqLine['breakdown'] {
  let high = 0;
  let medium = 0;
  let low = 0;
  let unclassified = 0;
  let userAdded = 0;
  let userConfirmed = 0;
  for (const d of cluster) {
    if (d.origin === 'user_added') userAdded++;
    if (d.status === 'confirmed') userConfirmed++;
    if (d.typeKey === null) unclassified++;
    else if (d.confidence === 'high') high++;
    else if (d.confidence === 'medium') medium++;
    else low++;
  }
  return { high, medium, low, unclassified, userAdded, userConfirmed };
}

function lineVerified(state: 'draft' | 'approved', cluster: readonly EffectiveDetection[], completeness: Boq['completeness']): boolean {
  if (state !== 'approved') return false;
  if (completeness.partialSheets.length > 0 || completeness.skippedSheets.length > 0) return false;
  if (cluster.some((d) => d.needsReview)) return false;
  return true;
}

function lineKey(parts: {
  lineKind: BoqLineKind;
  typeKey: string | null;
  floor: string | null;
  areaId: string | null;
  ruleId: string | null;
}): string {
  return `${parts.lineKind}|${parts.typeKey ?? 'null'}|${parts.floor ?? ''}|${parts.areaId ?? ''}|${parts.ruleId ?? ''}`;
}

function buildQuantityLine(input: {
  cluster: readonly EffectiveDetection[];
  typeKey: string;
  label: string;
  category: BoqLine['category'];
  lineKind: BoqLineKind;
  unit: string;
  rule: MeasurementRule;
  floor: string | null;
  areaId: string | null;
  state: 'draft' | 'approved';
  completeness: Boq['completeness'];
  excluded: boolean;
  quantityOverride?: number;
  symbolCount?: number;
  detectionIds?: string[];
}): BoqLine {
  const quantity = input.quantityOverride ?? (input.rule.mode === 'group_by_proximity' ? 1 : input.cluster.length);
  return {
    key: lineKey({
      lineKind: input.lineKind,
      typeKey: input.typeKey,
      floor: input.floor,
      areaId: input.areaId,
      ruleId: input.rule.id,
    }),
    typeKey: input.typeKey,
    label: input.label,
    category: input.category,
    lineKind: input.lineKind,
    unit: input.unit,
    quantity,
    symbolCount: input.symbolCount,
    floor: input.floor,
    areaId: input.areaId,
    ruleId: input.rule.id,
    detectionIds: input.detectionIds ?? input.cluster.map((d) => d.id).sort(),
    breakdown: buildBreakdown(input.cluster),
    verified: lineVerified(input.state, input.cluster, input.completeness),
    excluded: input.excluded,
  };
}

function unclassifiedFamily(rawClass: string | null | undefined): string {
  const cleaned = (rawClass ?? '').trim();
  if (!cleaned || cleaned === 'UNK' || cleaned === 'drawing_noise' || /^p\d+#\d+/i.test(cleaned)) return 'unclassified';
  if (cleaned.startsWith('symbol group') || cleaned.startsWith('סמל ללא')) return 'unclassified';
  return cleaned;
}

function unclassifiedLineLabel(family: string): string {
  if (family === 'unclassified') return 'לא מסווג — לבדיקה';
  return `${family} — לבדיקה`;
}

function buildUnclassifiedLine(
  cluster: readonly CountableDetection[],
  family: string,
): BoqLine {
  const rep = cluster[0]!;
  return {
    key: lineKey({
      lineKind: 'manual',
      typeKey: null,
      floor: rep.floor,
      areaId: rep.areaId,
      ruleId: `unclassified:${family}`,
    }),
    typeKey: null,
    label: unclassifiedLineLabel(family),
    category: 'unknown',
    lineKind: 'manual',
    unit: "יח'",
    quantity: cluster.length,
    floor: rep.floor ?? null,
    areaId: rep.areaId,
    ruleId: null,
    detectionIds: cluster.map((d) => d.id).sort(),
    breakdown: buildBreakdown(cluster),
    verified: false,
    excluded: false,
  };
}

function buildExcludedLine(
  cluster: readonly EffectiveDetection[],
  sample: CountableDetection,
  cat: CatalogType | undefined,
  rule: MeasurementRule,
  state: 'draft' | 'approved',
  completeness: Boq['completeness'],
): BoqLine {
  const lineKind = rule.output.lineKind ?? (cat ? roleToLineKind(cat.role) : 'device_count');
  return {
    ...buildQuantityLine({
      cluster,
      typeKey: sample.typeKey!,
      label: cat?.nameHe ?? sample.typeKey!,
      category: cat?.category ?? 'unknown',
      lineKind,
      unit: cat?.unit ?? "יח'",
      rule,
      floor: sample.floor,
      areaId: sample.areaId,
      state,
      completeness,
      excluded: true,
    }),
    quantity: cluster.length,
    verified: false,
  };
}

function buildCompleteness(sheets: readonly SheetDto[], warnings: string[]): Boq['completeness'] {
  const partialSheets: string[] = [];
  const skippedSheets: string[] = [];
  const xrefsMissing: string[] = [];
  const scaleUnverifiedSheets: string[] = [];
  let sheetsFullyAnalyzed = 0;

  for (const s of sheets) {
    if (s.analyzed === 'full') sheetsFullyAnalyzed++;
    if (s.analyzed === 'partial') {
      partialSheets.push(s.sheetKey);
      warnings.push(BOQ_WARNING_PARTIAL_SHEET(s.name || s.sheetKey));
    }
    if (s.analyzed === 'skipped') {
      skippedSheets.push(s.sheetKey);
      warnings.push(BOQ_WARNING_SKIPPED_SHEET(s.name || s.sheetKey));
    }
    if (!s.scale.verified) scaleUnverifiedSheets.push(s.sheetKey);
    for (const xref of s.xrefsMissing) {
      const label = xref.path ? `${xref.name} (${xref.path})` : xref.name;
      if (!xrefsMissing.includes(label)) {
        xrefsMissing.push(label);
        warnings.push(BOQ_WARNING_XREF_MISSING(label));
      }
    }
  }

  return {
    sheetsTotal: sheets.length,
    sheetsFullyAnalyzed,
    partialSheets,
    skippedSheets,
    xrefsMissing,
    scaleUnverifiedSheets,
  };
}

function appendLinearLines(
  lines: BoqLine[],
  linear: readonly WorkerLinear[],
  catalog: readonly CatalogType[],
  sheets: readonly SheetDto[],
  state: 'draft' | 'approved',
  completeness: Boq['completeness'],
  warnings: string[],
): void {
  const catalogMap = catalogByKey(catalog);
  for (const item of linear) {
    if (!item.scaleVerified || item.lengthMeters == null) {
      warnings.push(BOQ_WARNING_SCALE_UNVERIFIED);
      continue;
    }
    const sheet = sheets.find((s) => s.sheetKey === item.sheetKey);
    const cat = item.typeKey ? catalogMap.get(item.typeKey) : undefined;
    const floor = sheet?.floorLabel ?? sheet?.floorHint ?? null;
    lines.push({
      key: lineKey({
        lineKind: 'length',
        typeKey: item.typeKey,
        floor,
        areaId: null,
        ruleId: 'linear',
      }),
      typeKey: item.typeKey,
      label: cat?.nameHe ?? item.typeKey ?? 'אורך ליניארי',
      category: cat?.category ?? 'conduit_tray',
      lineKind: 'length',
      unit: 'מ"א',
      quantity: item.lengthMeters,
      floor,
      areaId: null,
      ruleId: 'linear',
      detectionIds: [item.id],
      breakdown: { high: 1, medium: 0, low: 0, unclassified: 0, userAdded: 0, userConfirmed: 0 },
      verified: state === 'approved' && sheet?.scale.verified === true && completeness.partialSheets.length === 0,
      excluded: false,
    });
  }
}