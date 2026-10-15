import {
  SEGMENT_STRIDE,
  colorBitsFromSegmentFloat,
  layerIndexFromSegment,
  lineWeightHundredthsFromSegment,
  segmentCount,
} from './segment-format';
import { isLayerVisible, type LayerVisibilityState } from './layer-visibility';
import { yieldToMain } from '../yield-to-main';

/** GPU line batch: contiguous vec2 positions for GL.LINES (pairs of endpoints). */
export type ColorLineBatch = {
  colorBits: number;
  /** Screen-space line width (CSS px), derived from DWG lineweight. */
  lineWidthPx: number;
  /** Pairs of x,y per vertex; length is multiple of 4. */
  positions: Float32Array;
  vertexCount: number;
};

function batchKey(colorBits: number, lwHundredths: number): number {
  const bucket = Math.min(255, Math.max(1, Math.round(lwHundredths / 5)));
  return (colorBits & 0xffffff) | (bucket << 24);
}

function lineWidthPxFromHundredths(hundredths: number, zoom: number): number {
  const mm = hundredths / 100;
  return Math.min(8, Math.max(1, mm * zoom * 0.35 + 0.75));
}

export type SegmentBatchResult = {
  batches: ColorLineBatch[];
  drawnSegments: number;
  skippedByLayer: number;
};

const SEGMENTS_PER_YIELD = 40_000;

/**
 * Group visible segments by packed color for fewer uniform changes.
 * Positions are copied as-is (RTC world coords).
 */
export function buildColorLineBatches(
  segments: Float32Array,
  visibility: LayerVisibilityState,
  zoom = 1,
): SegmentBatchResult {
  const n = segmentCount(segments);
  const floatCounts = new Map<number, number>();
  const lwByKey = new Map<number, number>();
  let skippedByLayer = 0;

  for (let i = 0; i < n; i += 1) {
    const base = i * SEGMENT_STRIDE;
    const layer = layerIndexFromSegment(segments[base + 5]!);
    if (!isLayerVisible(visibility, layer)) {
      skippedByLayer += 1;
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
    const lw = lineWeightHundredthsFromSegment(segments[base + 6]!);
    const key = batchKey(colorBits, lw);
    floatCounts.set(key, (floatCounts.get(key) ?? 0) + 4);
    lwByKey.set(key, lw);
  }

  const writers = new Map<number, { positions: Float32Array; offset: number }>();
  for (const [key, len] of floatCounts) {
    writers.set(key, { positions: new Float32Array(len), offset: 0 });
  }

  let drawnSegments = 0;
  for (let i = 0; i < n; i += 1) {
    const base = i * SEGMENT_STRIDE;
    const layer = layerIndexFromSegment(segments[base + 5]!);
    if (!isLayerVisible(visibility, layer)) {
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
    const lw = lineWeightHundredthsFromSegment(segments[base + 6]!);
    const key = batchKey(colorBits, lw);
    const w = writers.get(key)!;
    const o = w.offset;
    w.positions[o] = segments[base]!;
    w.positions[o + 1] = segments[base + 1]!;
    w.positions[o + 2] = segments[base + 2]!;
    w.positions[o + 3] = segments[base + 3]!;
    w.offset = o + 4;
    drawnSegments += 1;
  }

  const batches: ColorLineBatch[] = [];
  for (const [key, w] of writers) {
    const vertexCount = w.positions.length / 2;
    const colorBits = key & 0xffffff;
    const lw = lwByKey.get(key) ?? 25;
    batches.push({
      colorBits,
      lineWidthPx: lineWidthPxFromHundredths(lw, zoom),
      positions: w.positions,
      vertexCount,
    });
  }
  batches.sort((a, b) => a.colorBits - b.colorBits || a.lineWidthPx - b.lineWidthPx);
  return { batches, drawnSegments, skippedByLayer };
}

/** Same as {@link buildColorLineBatches} but yields during long scans to keep UI responsive. */
export async function buildColorLineBatchesAsync(
  segments: Float32Array,
  visibility: LayerVisibilityState,
  zoom = 1,
): Promise<SegmentBatchResult> {
  const n = segmentCount(segments);
  if (n <= SEGMENTS_PER_YIELD) {
    return buildColorLineBatches(segments, visibility, zoom);
  }

  const floatCounts = new Map<number, number>();
  const lwByKey = new Map<number, number>();
  let skippedByLayer = 0;

  for (let start = 0; start < n; start += SEGMENTS_PER_YIELD) {
    const end = Math.min(n, start + SEGMENTS_PER_YIELD);
    for (let i = start; i < end; i += 1) {
      const base = i * SEGMENT_STRIDE;
      const layer = layerIndexFromSegment(segments[base + 5]!);
      if (!isLayerVisible(visibility, layer)) {
        skippedByLayer += 1;
        continue;
      }
      const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
      const lw = lineWeightHundredthsFromSegment(segments[base + 6]!);
      const key = batchKey(colorBits, lw);
      floatCounts.set(key, (floatCounts.get(key) ?? 0) + 4);
      lwByKey.set(key, lw);
    }
    await yieldToMain();
  }

  const writers = new Map<number, { positions: Float32Array; offset: number }>();
  for (const [key, len] of floatCounts) {
    writers.set(key, { positions: new Float32Array(len), offset: 0 });
  }

  let drawnSegments = 0;
  for (let start = 0; start < n; start += SEGMENTS_PER_YIELD) {
    const end = Math.min(n, start + SEGMENTS_PER_YIELD);
    for (let i = start; i < end; i += 1) {
      const base = i * SEGMENT_STRIDE;
      const layer = layerIndexFromSegment(segments[base + 5]!);
      if (!isLayerVisible(visibility, layer)) {
        continue;
      }
      const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
      const lw = lineWeightHundredthsFromSegment(segments[base + 6]!);
      const key = batchKey(colorBits, lw);
      const w = writers.get(key)!;
      const o = w.offset;
      w.positions[o] = segments[base]!;
      w.positions[o + 1] = segments[base + 1]!;
      w.positions[o + 2] = segments[base + 2]!;
      w.positions[o + 3] = segments[base + 3]!;
      w.offset = o + 4;
      drawnSegments += 1;
    }
    await yieldToMain();
  }

  const batches: ColorLineBatch[] = [];
  for (const [key, w] of writers) {
    const colorBits = key & 0xffffff;
    const lw = lwByKey.get(key) ?? 25;
    batches.push({
      colorBits,
      lineWidthPx: lineWidthPxFromHundredths(lw, zoom),
      positions: w.positions,
      vertexCount: w.positions.length / 2,
    });
  }
  batches.sort((a, b) => a.colorBits - b.colorBits || a.lineWidthPx - b.lineWidthPx);
  return { batches, drawnSegments, skippedByLayer };
}
