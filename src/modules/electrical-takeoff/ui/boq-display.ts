import type { BoqLine, CatalogType } from '../domain/contracts';

const TECHNICAL_ID_LABEL = /^p\d+#\d+/i;

export type BoqLineStatus = 'verified' | 'forReview' | 'needsReview';

export type DetectionCensus = {
  total: number;
  typed: number;
  untyped: number;
  typedNeedingCheck: number;
};

/** Split marks the way the engine does: a type is a type, even when a review flag remains. */
export function detectionCensus(
  detections: readonly { typeKey: string | null; needsReview: boolean }[],
): DetectionCensus {
  let typed = 0;
  let untyped = 0;
  let typedNeedingCheck = 0;
  for (const detection of detections) {
    if (!detection.typeKey) {
      untyped += 1;
      continue;
    }
    typed += 1;
    if (detection.needsReview) typedNeedingCheck += 1;
  }
  return { total: detections.length, typed, untyped, typedNeedingCheck };
}

export type ControlGroup = {
  key: string;
  label: string;
  quantity: number;
  needsAttention: boolean;
  detectionIds: string[];
  focusId: string;
};

/** One row per type and status, so the review list is not a copy of every mark. */
export function groupDetectionsForControl<T extends { id: string; typeKey: string | null; needsReview: boolean }>(
  detections: readonly T[],
  labelOf: (detection: T) => string,
  quantityOf: (detection: T) => number,
): ControlGroup[] {
  const groups = new Map<string, ControlGroup>();
  for (const detection of detections) {
    const needsAttention = detection.needsReview || !detection.typeKey;
    const label = labelOf(detection);
    const key = `${needsAttention ? 'check' : 'ok'}::${label}`;
    const quantity = quantityOf(detection);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        label,
        quantity,
        needsAttention,
        detectionIds: [detection.id],
        focusId: detection.id,
      });
      continue;
    }
    existing.quantity += quantity;
    existing.detectionIds.push(detection.id);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return b.quantity - a.quantity || a.label.localeCompare(b.label, 'he');
  });
}

/** Collapse quantity rows that read as the same device and status. Does not change stored quantities. */
export function groupBoqLinesForDisplay(
  lines: readonly BoqLine[],
  catalog: readonly CatalogType[],
  unclassifiedLabel: string,
  suppressVerified: boolean,
): BoqLine[] {
  const groups = new Map<string, BoqLine>();
  for (const line of lines) {
    const label = boqLineDisplayLabel(line, catalog, unclassifiedLabel);
    const status = boqLineStatus(line, suppressVerified);
    const key = `${status}::${label}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...line,
        label,
        detectionIds: [...line.detectionIds],
      });
      continue;
    }
    existing.quantity += line.quantity;
    existing.symbolCount = undefined;
    existing.detectionIds = [...existing.detectionIds, ...line.detectionIds];
  }
  const rank: Record<BoqLineStatus, number> = { needsReview: 0, forReview: 1, verified: 2 };
  return [...groups.values()].sort((a, b) => {
    const statusDelta = rank[boqLineStatus(a, suppressVerified)] - rank[boqLineStatus(b, suppressVerified)];
    return statusDelta || b.quantity - a.quantity || a.label.localeCompare(b.label, 'he');
  });
}

export function boqLineDisplayLabel(
  line: BoqLine,
  catalog: readonly CatalogType[],
  unclassifiedLabel: string,
): string {
  if (!line.typeKey) return unclassifiedLabel;
  const fromCatalog = catalog.find((c) => c.key === line.typeKey)?.nameHe?.trim();
  if (fromCatalog) return fromCatalog;
  const trimmed = line.label.trim();
  if (trimmed && !TECHNICAL_ID_LABEL.test(trimmed) && !trimmed.includes('#')) {
    return trimmed;
  }
  return line.typeKey;
}

export function boqLineStatus(line: BoqLine, suppressVerified: boolean): BoqLineStatus {
  if (!line.typeKey) return 'forReview';
  if (line.breakdown.unclassified > 0) return 'needsReview';
  if (line.verified && !suppressVerified) return 'verified';
  if (line.breakdown.low > 0 || line.breakdown.medium > 0) return 'needsReview';
  return 'forReview';
}

export function detectionDisplayLabel(
  detection: { id: string; typeKey: string | null; rawClass?: string | null; tagText?: string | null },
  catalog: readonly CatalogType[],
  unclassifiedLabel: string,
): string {
  if (detection.typeKey) {
    return catalog.find((c) => c.key === detection.typeKey)?.nameHe?.trim() || detection.typeKey;
  }
  return unclassifiedLabel;
}