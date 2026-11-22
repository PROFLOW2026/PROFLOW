import type { EffectiveDetection, TakeoffReviewReason } from './contracts';

/** Reasons that always exclude a detection from BOQ quantities. Geometry may still remain on the plan. */
export const ALWAYS_NON_COUNTABLE: ReadonlySet<TakeoffReviewReason> = new Set([
  'legend_zone',
  'drawing_noise',
  'user_excluded',
]);

export function isUserExcludedFromBoq(detection: Pick<EffectiveDetection, 'reasons'>): boolean {
  return detection.reasons.includes('user_excluded');
}

/**
 * Paired PDF+DWG plan: DWG is primary; PDF is verification.
 * `pdf_only` rows are excluded until the user confirms them (`status: confirmed`).
 */
export function isDetectionCountable(d: EffectiveDetection): boolean {
  if (d.reasons.some((r) => ALWAYS_NON_COUNTABLE.has(r))) return false;
  if (d.reasons.includes('pdf_only') && d.status !== 'confirmed') return false;
  return true;
}

/** Within a twin group, prefer confirmed, then DWG (primary on paired sheets), then merged source. */
export function pickTwinRepresentative(group: readonly EffectiveDetection[]): EffectiveDetection {
  const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return (
    sorted.find((d) => d.status === 'confirmed') ??
    sorted.find((d) => d.source === 'dwg') ??
    sorted.find((d) => d.source === 'merged') ??
    sorted[0]!
  );
}

export type CountingExclusionSummary = {
  readonly legendZone: number;
  readonly pdfOnly: number;
  readonly notCountableOther: number;
};

export function summarizeExclusions(detections: readonly EffectiveDetection[]): CountingExclusionSummary {
  let legendZone = 0;
  let pdfOnly = 0;
  let other = 0;
  for (const d of detections) {
    if (!isDetectionCountable(d)) {
      if (d.reasons.includes('legend_zone')) legendZone += 1;
      else if (d.reasons.includes('pdf_only')) pdfOnly += 1;
      else other += 1;
    }
  }
  return { legendZone, pdfOnly, notCountableOther: other };
}

export function countTwinCollapse(
  detections: readonly EffectiveDetection[],
  twinIdByDetectionId: ReadonlyMap<string, string | undefined>,
): number {
  const byTwin = new Map<string, number>();
  for (const d of detections) {
    if (!isDetectionCountable(d)) continue;
    const twin = twinIdByDetectionId.get(d.id);
    if (!twin) continue;
    byTwin.set(twin, (byTwin.get(twin) ?? 0) + 1);
  }
  let collapsed = 0;
  for (const n of byTwin.values()) {
    if (n > 1) collapsed += n - 1;
  }
  return collapsed;
}

export function countedBySource(detections: readonly EffectiveDetection[]): Record<EffectiveDetection['source'], number> {
  const o: Record<EffectiveDetection['source'], number> = { pdf: 0, dwg: 0, manual: 0, merged: 0 };
  for (const d of detections) {
    if (isDetectionCountable(d)) o[d.source] += 1;
  }
  return o;
}