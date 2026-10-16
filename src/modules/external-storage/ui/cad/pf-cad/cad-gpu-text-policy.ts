/**
 * P8 GPU text handoff policy (regression guard).
 * Do not enable until record-complete geometry is proven; Canvas remains source of truth.
 */
export const P8_GPU_TEXT_HANDOFF_ENABLED = false;

/** Minimum stroke segments required before a record may skip Canvas (future P8). */
export const P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD = Number.POSITIVE_INFINITY;

export function mayMarkTextGpu(segmentsAdded: number, glyphsExpected: number): boolean {
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return false;
  if (glyphsExpected <= 0) return false;
  return segmentsAdded >= P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD;
}
