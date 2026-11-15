import type { BoqLine, CatalogType } from '../domain/contracts';

const TECHNICAL_ID_LABEL = /^p\d+#\d+/i;

export type BoqLineStatus = 'verified' | 'forReview' | 'needsReview';

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