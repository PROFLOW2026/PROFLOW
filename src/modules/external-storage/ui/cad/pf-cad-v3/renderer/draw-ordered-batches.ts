import {
  SEGMENT_STRIDE,
  TRIANGLE_STRIDE,
  colorBitsFromSegmentFloat,
  layerIndexFromSegment,
  lineWeightHundredthsFromSegment,
  segmentCount,
  triangleCount,
} from './segment-format';
import { isLayerVisible, type LayerVisibilityState } from './layer-visibility';
import { yieldToMain } from '../yield-to-main';

export type FillDrawBatch = {
  kind: 'fill';
  colorBits: number;
  architectural: boolean;
  positions: Float32Array;
  vertexCount: number;
};

export type LineDrawBatch = {
  kind: 'line';
  colorBits: number;
  architectural: boolean;
  lineWeightHundredths: number;
  /** Endpoint pairs (x1,y1,x2,y2) for wide-line mesh expansion at upload. */
  positions: Float32Array;
  vertexCount: number;
};

export type DrawBatch = FillDrawBatch | LineDrawBatch;

const SEGMENTS_PER_YIELD = 24_000;

type Prim =
  | {
      order: number;
      primIndex: number;
      kind: 'line';
      colorBits: number;
      architectural: boolean;
      lw: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      order: number;
      primIndex: number;
      kind: 'fill';
      colorBits: number;
      architectural: boolean;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
    };

/** Opaque draws before transparent at the same SORTENTS order. */
function alphaBucket(colorBits: number): number {
  const aByte = (colorBits >>> 24) & 0xff;
  if (aByte === 0 || aByte === 255) {
    return 0;
  }
  return 1;
}

function compareDrawOrder(a: Prim, b: Prim): number {
  if (a.order !== b.order) {
    return a.order - b.order;
  }
  const aa = alphaBucket(a.colorBits);
  const ab = alphaBucket(b.colorBits);
  if (aa !== ab) {
    return aa - ab;
  }
  if (a.kind !== b.kind) {
    return a.kind === 'fill' ? -1 : 1;
  }
  return a.primIndex - b.primIndex;
}

function collectPrims(
  segments: Float32Array,
  triangles: Float32Array,
  visibility: LayerVisibilityState,
  segStride: number,
  architecture?: ReadonlySet<number>,
): Prim[] {
  const prims: Prim[] = [];
  let primIndex = 0;
  const nSeg = segmentCount(segments, segStride);
  for (let i = 0; i < nSeg; i += 1) {
    const base = i * segStride;
    const layer = layerIndexFromSegment(segments[base + 5]!);
    if (!isLayerVisible(visibility, layer)) {
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
    const lw = lineWeightHundredthsFromSegment(segments[base + 6]!);
    const order = segStride >= 8 ? segments[base + 7]! : i;
    prims.push({
      order,
      primIndex: primIndex++,
      kind: 'line',
      colorBits,
      architectural: architecture?.has(layer) ?? false,
      lw,
      x1: segments[base]!,
      y1: segments[base + 1]!,
      x2: segments[base + 2]!,
      y2: segments[base + 3]!,
    });
  }
  const nTri = triangleCount(triangles);
  for (let i = 0; i < nTri; i += 1) {
    const base = i * TRIANGLE_STRIDE;
    const layer = layerIndexFromSegment(triangles[base + 7]!);
    if (!isLayerVisible(visibility, layer)) {
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(triangles[base + 6]!);
    const order = triangles[base + 9]!;
    prims.push({
      order,
      primIndex: primIndex++,
      kind: 'fill',
      colorBits,
      architectural: architecture?.has(layer) ?? false,
      x1: triangles[base]!,
      y1: triangles[base + 1]!,
      x2: triangles[base + 2]!,
      y2: triangles[base + 3]!,
      x3: triangles[base + 4]!,
      y3: triangles[base + 5]!,
    });
  }
  prims.sort(compareDrawOrder);
  return prims;
}

function flushLineBatch(
  batches: DrawBatch[],
  colorBits: number,
  lineWeightHundredths: number,
  architectural: boolean,
  floats: number[],
): void {
  if (floats.length === 0) {
    return;
  }
  batches.push({
    kind: 'line',
    colorBits,
    architectural,
    lineWeightHundredths,
    positions: Float32Array.from(floats),
    vertexCount: floats.length / 2,
  });
}

function flushFillBatch(
  batches: DrawBatch[],
  colorBits: number,
  architectural: boolean,
  floats: number[],
): void {
  if (floats.length === 0) {
    return;
  }
  batches.push({
    kind: 'fill',
    colorBits,
    architectural,
    positions: Float32Array.from(floats),
    vertexCount: floats.length / 2,
  });
}

export function buildOrderedDrawBatches(
  segments: Float32Array,
  triangles: Float32Array,
  visibility: LayerVisibilityState,
  segStride = SEGMENT_STRIDE,
  architecture?: ReadonlySet<number>,
): DrawBatch[] {
  const prims = collectPrims(segments, triangles, visibility, segStride, architecture);
  const batches: DrawBatch[] = [];
  let lineColor = -1;
  let lineLw = -1;
  let lineOrder = -1;
  let lineArch = false;
  let lineFloats: number[] = [];
  let fillColor = -1;
  let fillOrder = -1;
  let fillArch = false;
  let fillFloats: number[] = [];

  for (const p of prims) {
    if (p.kind === 'fill') {
      if (lineFloats.length > 0) {
        flushLineBatch(batches, lineColor, lineLw, lineArch, lineFloats);
        lineFloats = [];
        lineColor = -1;
      }
      if ((fillColor !== p.colorBits || fillOrder !== p.order || fillArch !== p.architectural) && fillFloats.length > 0) {
        flushFillBatch(batches, fillColor, fillArch, fillFloats);
        fillFloats = [];
      }
      fillColor = p.colorBits;
      fillOrder = p.order;
      fillArch = p.architectural;
      fillFloats.push(p.x1, p.y1, p.x2, p.y2, p.x3, p.y3);
    } else {
      if (fillFloats.length > 0) {
        flushFillBatch(batches, fillColor, fillArch, fillFloats);
        fillFloats = [];
        fillColor = -1;
      }
      if (
        (lineColor !== p.colorBits || lineLw !== p.lw || lineOrder !== p.order || lineArch !== p.architectural) &&
        lineFloats.length > 0
      ) {
        flushLineBatch(batches, lineColor, lineLw, lineArch, lineFloats);
        lineFloats = [];
      }
      lineColor = p.colorBits;
      lineLw = p.lw;
      lineOrder = p.order;
      lineArch = p.architectural;
      lineFloats.push(p.x1, p.y1, p.x2, p.y2);
    }
  }
  flushFillBatch(batches, fillColor, fillArch, fillFloats);
  flushLineBatch(batches, lineColor, lineLw, lineArch, lineFloats);
  return batches;
}

/** Fill triangles only, sorted by draw order (for hybrid line + fill rendering). */
export function buildFillDrawBatches(
  triangles: Float32Array,
  visibility: LayerVisibilityState,
): FillDrawBatch[] {
  const prims = collectPrims(new Float32Array(0), triangles, visibility, SEGMENT_STRIDE);
  const batches: FillDrawBatch[] = [];
  let fillColor = -1;
  let fillOrder = -1;
  let fillArch = false;
  let fillFloats: number[] = [];
  for (const p of prims) {
    if (p.kind !== 'fill') continue;
    if ((fillColor !== p.colorBits || fillOrder !== p.order || fillArch !== p.architectural) && fillFloats.length > 0) {
      flushFillBatch(batches, fillColor, fillArch, fillFloats);
      fillFloats = [];
    }
    fillColor = p.colorBits;
    fillOrder = p.order;
    fillArch = p.architectural;
    fillFloats.push(p.x1, p.y1, p.x2, p.y2, p.x3, p.y3);
  }
  flushFillBatch(batches, fillColor, fillArch, fillFloats);
  return batches;
}

export async function buildOrderedDrawBatchesAsync(
  segments: Float32Array,
  triangles: Float32Array,
  visibility: LayerVisibilityState,
  segStride = SEGMENT_STRIDE,
  architecture?: ReadonlySet<number>,
): Promise<DrawBatch[]> {
  if (segmentCount(segments, segStride) + triangleCount(triangles) <= SEGMENTS_PER_YIELD) {
    return buildOrderedDrawBatches(segments, triangles, visibility, segStride, architecture);
  }
  await yieldToMain();
  return buildOrderedDrawBatches(segments, triangles, visibility, segStride, architecture);
}
