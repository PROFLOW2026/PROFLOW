import type { CadText } from './types';

/**
 * P8 GPU text handoff policy (regression guard).
 * WASM may emit `gpu:true` only for record-complete geometry; Canvas stays on until enabled here.
 */
export const P8_GPU_TEXT_HANDOFF_ENABLED = false;

/** Minimum stroke segments required before a record may skip Canvas when handoff is enabled. */
export const P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD = Number.POSITIVE_INFINITY;

export function mayMarkTextGpu(segmentsAdded: number, glyphsExpected: number): boolean {
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return false;
  if (glyphsExpected <= 0) return false;
  return segmentsAdded >= P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD;
}

/** Canvas draws all text while handoff is disabled (avoids double-draw when WASM marks gpu). */
export function shouldDrawTextOnCanvas(text: CadText): boolean {
  if (!text.gpu) return true;
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return true;
  return false;
}
