import {
  hasHebrewBlock,
  maybeDecodeHebrewShxText,
} from './hebrew-shx-decode';
import type { CadText } from './types';

/**
 * P8 GPU text handoff policy (regression guard).
 * WASM may emit `gpu:true` only for record-complete geometry; Canvas stays on until enabled here.
 */
export const P8_GPU_TEXT_HANDOFF_ENABLED = true;

/** Minimum stroke segments required before a record may skip Canvas when handoff is enabled. */
export const P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD = 1;

export function mayMarkTextGpu(segmentsAdded: number, glyphsExpected: number): boolean {
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return false;
  if (glyphsExpected <= 0) return false;
  return segmentsAdded >= P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD;
}

/** Hebrew / CP862 SHX must stay on Canvas (GPU stroke path not parity-verified). */
export function shxTextRequiresCanvasFallback(tx: CadText): boolean {
  if (tx.invisible) return false;
  const raw = tx.lines?.length ? tx.lines.join('\n') : tx.t;
  if (hasHebrewBlock(raw)) return true;
  const decoded = maybeDecodeHebrewShxText(raw, tx.style);
  return hasHebrewBlock(decoded);
}

/** Canvas draws when handoff off, Hebrew SHX, or record not marked gpu. */
export function shouldDrawTextOnCanvas(text: CadText): boolean {
  if (shxTextRequiresCanvasFallback(text)) return true;
  if (!text.gpu) return true;
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return true;
  return false;
}
