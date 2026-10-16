import {
  hasHebrewBlock,
  maybeDecodeHebrewShxText,
} from './hebrew-shx-decode';
import type { CadText } from './types';

/**
 * P8 GPU text handoff policy (regression guard).
 * WASM may emit `gpu:true` only for record-complete geometry; SHX append enforces the same bar.
 */
export const P8_GPU_TEXT_HANDOFF_ENABLED = true;

/** Minimum stroke segments required before a record may skip Canvas when handoff is enabled. */
export const P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD = 1;

/** True when segment buffer covers every expected drawable glyph (SHX + pf-fonts). */
export function mayMarkTextGpu(segmentsAdded: number, glyphsExpected: number): boolean {
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return false;
  if (glyphsExpected <= 0) return false;
  if (segmentsAdded < P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD) return false;
  return segmentsAdded >= glyphsExpected;
}

/** Hebrew / keyboard-latin SHX labels must use Canvas (decode + Noto / TTF fill), not WASM gpu stubs. */
export function shxTextRequiresCanvasFallback(tx: CadText): boolean {
  if (tx.invisible) return false;
  const raw = tx.lines?.length ? tx.lines.join('\n') : tx.t;
  if (hasHebrewBlock(raw)) return true;
  const decoded = maybeDecodeHebrewShxText(raw, tx.style);
  return hasHebrewBlock(decoded);
}

/**
 * Canvas overlay when handoff is off or the record is not GPU-complete (`gpu` unset upstream).
 * Never double-draw: `gpu:true` is only set after record-complete geometry is in the segment buffer.
 */
export function shouldDrawTextOnCanvas(text: CadText): boolean {
  if (shxTextRequiresCanvasFallback(text)) return true;
  if (!text.gpu) return true;
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) return true;
  return false;
}
