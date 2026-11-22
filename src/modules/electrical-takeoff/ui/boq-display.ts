import { cadHtmlTextLine } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-text-bidi';
import type { BoqLine, CatalogType } from '../domain/contracts';
import { plannerItemName } from '../domain/legend-identity';
import {
  boqLineConfirmationCounts,
  boqLineIdentityStatus,
  type IdentityReviewStatus,
} from '../domain/review-copy';

const TECHNICAL_ID_LABEL = /^p\d+#\d+/i;

export type BoqLineStatus = IdentityReviewStatus;

export type DetectionCensus = {
  total: number;
  typed: number;
  untyped: number;
  typedNeedingCheck: number;
};

function isIdentifiedMark(detection: {
  typeKey: string | null;
  identitySource?: string;
  originalText?: string | null;
  legendUnambiguous?: boolean;
}): boolean {
  return Boolean(detection.typeKey) || Boolean(detection.legendUnambiguous && detection.originalText);
}

/** Split marks the way the engine does: identified quantity vs leftover review. */
export function detectionCensus(
  detections: readonly {
    typeKey: string | null;
    needsReview: boolean;
    identitySource?: string;
    originalText?: string | null;
    legendUnambiguous?: boolean;
  }[],
): DetectionCensus {
  let typed = 0;
  let untyped = 0;
  let typedNeedingCheck = 0;
  for (const detection of detections) {
    if (!isIdentifiedMark(detection)) {
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
export function groupDetectionsForControl<
  T extends {
    id: string;
    typeKey: string | null;
    needsReview: boolean;
    identitySource?: string;
    originalText?: string | null;
    legendUnambiguous?: boolean;
  },
>(
  detections: readonly T[],
  labelOf: (detection: T) => string,
  quantityOf: (detection: T) => number,
): ControlGroup[] {
  const groups = new Map<string, ControlGroup>();
  for (const detection of detections) {
    const needsAttention = detection.needsReview || !isIdentifiedMark(detection);
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
  const rank: Record<BoqLineStatus, number> = {
    unclassified: 0,
    needsCheck: 1,
    partiallyApproved: 2,
    autoIdentified: 3,
    manuallyApproved: 4,
  };
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
  const original = line.originalLabel?.trim();
  if (original) return cadHtmlTextLine(original);
  const trimmed = line.label.trim();
  const fromPlanner =
    line.identitySource === 'legend' || line.identitySource === 'library' || line.identitySource === 'manual';
  if (fromPlanner && trimmed && !TECHNICAL_ID_LABEL.test(trimmed)) return cadHtmlTextLine(trimmed);
  if (!line.typeKey) return unclassifiedLabel;
  const fromCatalog = catalog.find((c) => c.key === line.typeKey)?.nameHe?.trim();
  if (fromCatalog) return cadHtmlTextLine(fromCatalog);
  if (trimmed && !TECHNICAL_ID_LABEL.test(trimmed) && !trimmed.includes('#')) return cadHtmlTextLine(trimmed);
  return line.typeKey;
}

export function boqLineStatus(line: BoqLine, suppressVerified: boolean): BoqLineStatus {
  return boqLineIdentityStatus({
    verified: line.verified,
    identitySource: line.identitySource,
    typeKey: line.typeKey,
    originalLabel: line.originalLabel,
    breakdown: line.breakdown,
    suppressVerified,
  });
}

export function boqLineApprovalCounts(line: Pick<BoqLine, 'breakdown'>): {
  total: number;
  confirmed: number;
  pending: number;
} {
  return boqLineConfirmationCounts(line.breakdown);
}

export function detectionDisplayLabel(
  detection: {
    id: string;
    typeKey: string | null;
    rawClass?: string | null;
    tagText?: string | null;
    originalText?: string | null;
    legendLabel?: string | null;
    userLabel?: string | null;
  },
  catalog: readonly CatalogType[],
  unclassifiedLabel: string,
): string {
  const fromPlanner = plannerItemName(detection);
  if (fromPlanner) return cadHtmlTextLine(fromPlanner);
  if (detection.typeKey) {
    const fromCatalog = catalog.find((c) => c.key === detection.typeKey)?.nameHe?.trim() || detection.typeKey;
    return cadHtmlTextLine(fromCatalog);
  }
  return unclassifiedLabel;
}