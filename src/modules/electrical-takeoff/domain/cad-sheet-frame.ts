/** Map a takeoff sheet onto one parsed pf-cad-v3 space, in that space's world coordinates. */

export type ModelWindow = {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
};

export type PaperRect = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type CadSpaceGeometry = {
  space: string;
  origin: readonly [number, number];
  segments: Float32Array;
  texts: readonly string[];
};

export type CadNativeSample = {
  nativeX: number;
  nativeY: number;
  previewX: number;
  previewY: number;
};

export type CadSheetMark = {
  id: string;
  nativeX: number;
  nativeY: number;
  signature?: string | null;
  colorHex?: string;
};

export type CadSheetFrame = {
  space: string;
  originX: number;
  originY: number;
  window: ModelWindow | null;
  /** Viewport rectangle in the same world coordinates as `segments`. */
  paper: PaperRect | null;
  /** World units per model unit. 1 in model space. */
  scale: number;
  /** Fixture centers, with padding. This is the whole plan, not the distant model extent. */
  plan: readonly [number, number, number, number];
  marks: {
    id: string;
    x: number;
    y: number;
    half: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    located: boolean;
  }[];
};

const STRIDE = 8;
const AXIS_SLACK = 1.5;
const MIN_EDGE = 40;

export function sheetMatchTokens(sheetKey: string, sheetName: string): string[] {
  const fromKey = sheetKey.startsWith('layout:') ? sheetKey.slice('layout:'.length) : '';
  const tokens = new Set<string>();
  for (const value of [fromKey, sheetName]) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    tokens.add(trimmed.toLowerCase());
    for (const part of trimmed.split(/[^0-9A-Za-z\u0590-\u05FF]+/)) {
      if (part.length >= 2) tokens.add(part.toLowerCase());
    }
  }
  return [...tokens];
}

export function textMatchesSheet(texts: readonly string[], tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const wanted = new Set(tokens);
  for (const text of texts) {
    const parts = text.split(/[^0-9A-Za-z\u0590-\u05FF]+/).filter((part) => part.length >= 2);
    if (parts.some((part) => wanted.has(part.toLowerCase()))) return true;
    if (wanted.has(text.trim().toLowerCase())) return true;
  }
  return false;
}

/** Recover the model window implied by preview pixels and native model coordinates. */
export function solveModelWindow(
  samples: readonly CadNativeSample[],
  widthPx: number,
  heightPx: number,
): ModelWindow | null {
  if (samples.length < 2 || widthPx <= 0 || heightPx <= 0) return null;
  const xFit = fitLine(
    samples.map((sample) => sample.previewX / widthPx),
    samples.map((sample) => sample.nativeX),
  );
  const yFit = fitLine(
    samples.map((sample) => sample.previewY / heightPx),
    samples.map((sample) => sample.nativeY),
  );
  if (!xFit || !yFit) return null;
  const hw = xFit.b / 2;
  const hh = -yFit.b / 2;
  if (!(hw > 1) || !(hh > 1)) return null;
  return { cx: xFit.a + hw, cy: yFit.a - hh, hw, hh };
}

export function modelToWorld(
  nativeX: number,
  nativeY: number,
  frame: Pick<CadSheetFrame, 'originX' | 'originY' | 'window' | 'paper' | 'scale'>,
): { x: number; y: number } {
  if (frame.paper && frame.window) {
    return {
      x: frame.paper.centerX + (nativeX - frame.window.cx) * frame.scale,
      y: frame.paper.centerY + (nativeY - frame.window.cy) * frame.scale,
    };
  }
  return { x: nativeX - frame.originX, y: nativeY - frame.originY };
}

export function previewToWorld(
  previewX: number,
  previewY: number,
  frame: Pick<CadSheetFrame, 'originX' | 'originY' | 'window' | 'paper' | 'scale'>,
  widthPx: number,
  heightPx: number,
): { x: number; y: number } | null {
  if (!frame.window || widthPx <= 0 || heightPx <= 0) return null;
  const { cx, cy, hw, hh } = frame.window;
  const nativeX = cx - hw + (previewX / widthPx) * 2 * hw;
  const nativeY = cy + hh - (previewY / heightPx) * 2 * hh;
  return modelToWorld(nativeX, nativeY, frame);
}

export function worldToPreview(
  worldX: number,
  worldY: number,
  frame: Pick<CadSheetFrame, 'originX' | 'originY' | 'window' | 'paper' | 'scale'>,
  widthPx: number,
  heightPx: number,
): { x: number; y: number } | null {
  if (!frame.window) return null;
  let nativeX: number;
  let nativeY: number;
  if (frame.paper) {
    nativeX = frame.window.cx + (worldX - frame.paper.centerX) / frame.scale;
    nativeY = frame.window.cy + (worldY - frame.paper.centerY) / frame.scale;
  } else {
    nativeX = worldX + frame.originX;
    nativeY = worldY + frame.originY;
  }
  const { cx, cy, hw, hh } = frame.window;
  return {
    x: ((nativeX - (cx - hw)) / (2 * hw)) * widthPx,
    y: ((cy + hh - nativeY) / (2 * hh)) * heightPx,
  };
}

export function chooseCadSheetFrame(input: {
  sheetKey: string;
  sheetName: string;
  kind: 'dwg_layout' | 'dwg_model' | 'pdf_page';
  widthPx: number;
  heightPx: number;
  samples: readonly CadNativeSample[];
  marks: readonly CadSheetMark[];
  spaces: readonly CadSpaceGeometry[];
}): CadSheetFrame | null {
  if (input.kind === 'pdf_page') return null;
  const modelSpace = input.spaces.find((space) => space.space.includes('Model')) ?? input.spaces[0];
  if (!modelSpace) return null;
  const window = solveModelWindow(input.samples, input.widthPx, input.heightPx);
  const tokens = sheetMatchTokens(input.sheetKey, input.sheetName);
  const modelFrame = frameFor(modelSpace, window, null, input.marks);

  if (input.kind === 'dwg_model' || !window) return modelFrame;

  const aspect = window.hw / window.hh;
  let best: { frame: CadSheetFrame; hits: number; named: boolean } | null = null;
  for (const space of input.spaces) {
    if (space.space === modelSpace.space) continue;
    const rects = paperRects(space.segments).filter((rect) => {
      const rectAspect = rect.width / rect.height;
      return Math.abs(rectAspect - aspect) / aspect <= 0.15;
    });
    for (const rect of rects) {
      const scale = rect.height / (2 * window.hh);
      if (!(scale > 0)) continue;
      const frame = frameFor(space, window, rect, input.marks, scale);
      const probed = Math.min(8, frame.marks.length);
      const radius = Math.max(6, rect.height * 0.012);
      const hits = inkHits(space.segments, frame.marks, radius);
      const named = textMatchesSheet(space.texts, tokens);
      if (hits < Math.min(2, probed)) continue;
      const better =
        !best ||
        (named && !best.named) ||
        (named === best.named && hits > best.hits) ||
        (named === best.named && hits === best.hits && rect.width * rect.height > (best.frame.paper?.width ?? 0) * (best.frame.paper?.height ?? 0));
      if (better) best = { frame, hits, named };
    }
  }
  if (!best) return modelFrame;
  const probed = Math.min(8, best.frame.marks.length);
  const needed = Math.max(1, Math.ceil(probed * 0.5));
  if (best.hits < needed && !best.named) return modelFrame;
  return best.frame;
}

function frameFor(
  space: CadSpaceGeometry,
  window: ModelWindow | null,
  paper: PaperRect | null,
  marks: readonly CadSheetMark[],
  scale = 1,
): CadSheetFrame {
  const draft: CadSheetFrame = {
    space: space.space,
    originX: space.origin[0],
    originY: space.origin[1],
    window,
    paper,
    scale: paper ? scale : 1,
    plan: [0, 0, 0, 0],
    marks: [],
  };
  const worlds = marks.map((mark) => ({ id: mark.id, ...modelToWorld(mark.nativeX, mark.nativeY, draft) }));
  draft.plan = planExtent(worlds);
  draft.marks = worlds.map((world) => {
    const box = symbolFrame(space.segments, world.x, world.y, worlds, world.id);
    return { id: world.id, x: world.x, y: world.y, ...box };
  });
  return draft;
}

export function planExtent(points: readonly { x: number; y: number }[]): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const padX = Math.max(spanX * 0.04, 40);
  const padY = Math.max(spanY, 40);
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
}

function inkHits(
  segments: Float32Array,
  marks: readonly { x: number; y: number }[],
  radius: number,
): number {
  const probe = marks.length <= 8 ? marks : spread(marks, 8);
  let hits = 0;
  for (const mark of probe) {
    if (symbolInkCount(segments, mark.x, mark.y, radius) >= 8) hits += 1;
  }
  return hits;
}

/** Short segments around a point. A real symbol is a cluster; a wall is one long line. */
export function symbolInkCount(segments: Float32Array, x: number, y: number, radius: number): number {
  const radiusSq = radius * radius;
  const maxLen = radius * 4;
  let count = 0;
  for (let i = 0; i + STRIDE - 1 < segments.length; i += STRIDE) {
    const x1 = segments[i] ?? 0;
    const y1 = segments[i + 1] ?? 0;
    const x2 = segments[i + 2] ?? 0;
    const y2 = segments[i + 3] ?? 0;
    if (x < Math.min(x1, x2) - radius || x > Math.max(x1, x2) + radius) continue;
    if (y < Math.min(y1, y2) - radius || y > Math.max(y1, y2) + radius) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > maxLen) continue;
    if (distanceToSegmentSq(x, y, x1, y1, x2, y2) <= radiusSq) count += 1;
  }
  return count;
}

function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    const item = items[index];
    if (item) out.push(item);
  }
  return out;
}

export type SymbolBox = {
  half: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  located: boolean;
};

/**
 * Bounds of the real strokes that belong to the fixture at this point.
 * The search stops before the next fixture. A long wall is not part of the symbol.
 * When the strokes cannot be identified, `located` is false and no box should be drawn.
 */
export function symbolFrame(
  segments: Float32Array,
  x: number,
  y: number,
  others: readonly { id?: string; x: number; y: number }[],
  selfId?: string,
  skipLayers?: ReadonlySet<number>,
): SymbolBox {
  let nearest = Infinity;
  for (const other of others) {
    if (selfId && other.id === selfId) continue;
    const distance = Math.hypot(other.x - x, other.y - y);
    if (distance > 1 && distance < nearest) nearest = distance;
  }
  const radius = Number.isFinite(nearest) ? Math.min(nearest * 0.45, 64) : 32;
  const empty = { half: 0, minX: x, minY: y, maxX: x, maxY: y, located: false };
  if (!(radius > 1)) return empty;
  const maxLen = radius * 2;
  const edges: Array<[number, number, number, number]> = [];
  for (let i = 0; i + STRIDE - 1 < segments.length; i += STRIDE) {
    if (skipLayers?.has(Math.trunc(segments[i + 5] ?? 0))) continue;
    const x1 = segments[i] ?? 0;
    const y1 = segments[i + 1] ?? 0;
    const x2 = segments[i + 2] ?? 0;
    const y2 = segments[i + 3] ?? 0;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (!(len > 0) || len > maxLen) continue;
    if (x < Math.min(x1, x2) - radius || x > Math.max(x1, x2) + radius) continue;
    if (y < Math.min(y1, y2) - radius || y > Math.max(y1, y2) + radius) continue;
    if (distanceToSegmentSq(x, y, x1, y1, x2, y2) > radius * radius) continue;
    edges.push([x1, y1, x2, y2]);
  }
  if (edges.length < 3) return empty;
  const gap = 0.05;
  const parent = edges.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index] ?? index)));
  const buckets = new Map<number, number[]>();
  const cell = (value: number) => Math.round(value / gap);
  const add = (px: number, py: number, index: number) => {
    const key = cell(px) * 73856093 + cell(py) * 19349663;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  };
  edges.forEach(([x1, y1, x2, y2], index) => {
    add(x1, y1, index);
    add(x2, y2, index);
  });
  for (const bucket of buckets.values()) {
    const head = bucket[0];
    if (head === undefined) continue;
    for (let index = 1; index < bucket.length; index += 1) {
      const other = bucket[index];
      if (other !== undefined) parent[find(other)] = find(head);
    }
  }
  const grouped = new Map<number, { distance: number; count: number; minX: number; minY: number; maxX: number; maxY: number }>();
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    if (!edge) continue;
    const root = find(index);
    const distance = distanceToSegmentSq(x, y, edge[0], edge[1], edge[2], edge[3]);
    const group = grouped.get(root);
    if (!group) {
      grouped.set(root, {
        distance,
        count: 1,
        minX: Math.min(edge[0], edge[2]),
        minY: Math.min(edge[1], edge[3]),
        maxX: Math.max(edge[0], edge[2]),
        maxY: Math.max(edge[1], edge[3]),
      });
      continue;
    }
    group.distance = Math.min(group.distance, distance);
    group.count += 1;
    group.minX = Math.min(group.minX, edge[0], edge[2]);
    group.minY = Math.min(group.minY, edge[1], edge[3]);
    group.maxX = Math.max(group.maxX, edge[0], edge[2]);
    group.maxY = Math.max(group.maxY, edge[1], edge[3]);
  }
  let best: { distance: number; count: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const group of grouped.values()) {
    if (!best || group.distance < best.distance) best = group;
  }
  if (!best || best.distance > radius * radius) return empty;
  const { count, minX, minY, maxX, maxY } = best;
  const span = Math.max(maxX - minX, maxY - minY);
  if (count < 3 || !(span > 0) || span > radius * 2.2 || span > 96) return empty;
  const pad = span * 0.08;
  return {
    half: span * 0.5 + pad,
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    located: true,
  };
}

/** Real CAD strokes inside a located symbol box, for a glyph thumbnail. */
export function symbolGlyphStrokes(
  segments: Float32Array,
  box: SymbolBox,
  skipLayers?: ReadonlySet<number>,
): Array<[number, number, number, number]> {
  if (!box.located) return [];
  const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1) * 0.08;
  const minX = box.minX - pad;
  const minY = box.minY - pad;
  const maxX = box.maxX + pad;
  const maxY = box.maxY + pad;
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i + STRIDE - 1 < segments.length; i += STRIDE) {
    if (skipLayers?.has(Math.trunc(segments[i + 5] ?? 0))) continue;
    const x1 = segments[i] ?? 0;
    const y1 = segments[i + 1] ?? 0;
    const x2 = segments[i + 2] ?? 0;
    const y2 = segments[i + 3] ?? 0;
    const inside =
      x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY && x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY;
    if (!inside) continue;
    out.push([x1, y1, x2, y2]);
  }
  return out;
}

export function symbolGlyphSvg(
  strokes: readonly [number, number, number, number][],
  box: SymbolBox,
  colorHex = '#111827',
): string | null {
  if (!box.located || strokes.length === 0) return null;
  const width = Math.max(box.maxX - box.minX, 1);
  const height = Math.max(box.maxY - box.minY, 1);
  const pad = Math.max(width, height) * 0.12;
  const minX = box.minX - pad;
  const maxY = box.maxY + pad;
  const viewW = width + pad * 2;
  const viewH = height + pad * 2;
  const d = strokes
    .map(([x1, y1, x2, y2]) => `M ${(x1 - minX).toFixed(2)} ${(maxY - y1).toFixed(2)} L ${(x2 - minX).toFixed(2)} ${(maxY - y2).toFixed(2)}`)
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW.toFixed(2)} ${viewH.toFixed(2)}" fill="none" stroke="${colorHex}" stroke-width="${Math.max(viewW, viewH) * 0.035}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" /></svg>`;
}

/** Default pad around a located CAD symbol (~current 0.37 body). Slider may pass a different factor. */
export const CAD_SYMBOL_FOCUS_PAD_DEFAULT = 0.37;
const CAD_SYMBOL_FOCUS_PAD_MIN = 0.125;
export const CAD_INSERT_FOCUS_HALF_DEFAULT = 32;
/** Context window: enough wall/room around the accessory, never a 1-unit pin. */
export const CAD_OCCURRENCE_CONTEXT_MIN_RATIO = 0.12;
export const CAD_OCCURRENCE_CONTEXT_MAX_RATIO = 0.28;
export const CAD_OCCURRENCE_CONTEXT_BODY_FACTOR = 8;
export const CAD_OCCURRENCE_CONTEXT_FALLBACK_SPAN = 160;

/** Tight native window around one located CAD symbol — not the sheet or the whole group. */
export function cadSymbolFocusExtent(
  box: Pick<SymbolBox, 'minX' | 'minY' | 'maxX' | 'maxY'>,
  padFactor: number = CAD_SYMBOL_FOCUS_PAD_DEFAULT,
): [number, number, number, number] {
  const body = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  const pad = Math.max(body * padFactor, body * CAD_SYMBOL_FOCUS_PAD_MIN);
  return [box.minX - pad, box.minY - pad, box.maxX + pad, box.maxY + pad];
}

/** Window around an insert whose own strokes were not located. Tight enough to identify, not a sheet fit. */
export function cadInsertFocusExtent(
  x: number,
  y: number,
  half: number = CAD_INSERT_FOCUS_HALF_DEFAULT,
): [number, number, number, number] {
  const span = Math.max(half, 8);
  return [x - span, y - span, x + span, y + span];
}

export function isPlausibleSymbolBox(box: Pick<SymbolBox, 'located' | 'minX' | 'minY' | 'maxX' | 'maxY'>): boolean {
  if (!box.located) return false;
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  return span > 0 && span <= 96;
}

/** True when the located strokes are large enough to be the accessory, not a pin. */
export function isReliableSymbolGeometry(
  box: Pick<SymbolBox, 'located' | 'minX' | 'minY' | 'maxX' | 'maxY'>,
): boolean {
  if (!box.located) return false;
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  return span >= 2 && span <= 96;
}

export type CadDrawingExtent = readonly [number, number, number, number];

/**
 * Camera window for one occurrence: the accessory plus nearby plan context.
 * Never fits a single insert, a near-zero box, or the whole sheet.
 */
export function cadOccurrenceFocusExtent(
  center: { x: number; y: number },
  box: Pick<SymbolBox, 'located' | 'minX' | 'minY' | 'maxX' | 'maxY'> | null,
  drawing: CadDrawingExtent | null | undefined,
): [number, number, number, number] {
  const reliable = box != null && isReliableSymbolGeometry(box);
  const cx = reliable ? (box.minX + box.maxX) / 2 : center.x;
  const cy = reliable ? (box.minY + box.maxY) / 2 : center.y;
  const body = reliable ? Math.max(box.maxX - box.minX, box.maxY - box.minY) : 0;
  const drawW = drawing ? drawing[2] - drawing[0] : 0;
  const drawH = drawing ? drawing[3] - drawing[1] : 0;
  const shortSide = Math.min(drawW, drawH);
  const minSpan =
    shortSide > 8 ? shortSide * CAD_OCCURRENCE_CONTEXT_MIN_RATIO : CAD_OCCURRENCE_CONTEXT_FALLBACK_SPAN;
  const maxSpan =
    shortSide > 8 ? shortSide * CAD_OCCURRENCE_CONTEXT_MAX_RATIO : CAD_OCCURRENCE_CONTEXT_FALLBACK_SPAN * 2;
  const span = Math.min(Math.max(body * CAD_OCCURRENCE_CONTEXT_BODY_FACTOR, minSpan), maxSpan);
  const half = span / 2;
  return [cx - half, cy - half, cx + half, cy + half];
}

export function segmentNear(segments: Float32Array, x: number, y: number, radius: number): boolean {
  const radiusSq = radius * radius;
  for (let i = 0; i + STRIDE - 1 < segments.length; i += STRIDE) {
    const x1 = segments[i] ?? 0;
    const y1 = segments[i + 1] ?? 0;
    const x2 = segments[i + 2] ?? 0;
    const y2 = segments[i + 3] ?? 0;
    if (x < Math.min(x1, x2) - radius || x > Math.max(x1, x2) + radius) continue;
    if (y < Math.min(y1, y2) - radius || y > Math.max(y1, y2) + radius) continue;
    if (distanceToSegmentSq(x, y, x1, y1, x2, y2) <= radiusSq) return true;
  }
  return false;
}

function distanceToSegmentSq(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 1e-12 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq)) : 0;
  const px = x1 + t * dx - x;
  const py = y1 + t * dy - y;
  return px * px + py * py;
}

export function paperRects(segments: Float32Array): PaperRect[] {
  const horiz: { x0: number; x1: number; y: number }[] = [];
  const vert: { y0: number; y1: number; x: number }[] = [];
  for (let i = 0; i + STRIDE - 1 < segments.length; i += STRIDE) {
    const x1 = segments[i] ?? 0;
    const y1 = segments[i + 1] ?? 0;
    const x2 = segments[i + 2] ?? 0;
    const y2 = segments[i + 3] ?? 0;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (dx >= MIN_EDGE && dy <= AXIS_SLACK) {
      horiz.push({ x0: Math.min(x1, x2), x1: Math.max(x1, x2), y: (y1 + y2) / 2 });
    } else if (dy >= MIN_EDGE && dx <= AXIS_SLACK) {
      vert.push({ y0: Math.min(y1, y2), y1: Math.max(y1, y2), x: (x1 + x2) / 2 });
    }
  }
  const rects: PaperRect[] = [];
  for (let i = 0; i < horiz.length; i += 1) {
    const a = horiz[i];
    if (!a) continue;
    for (let j = i + 1; j < horiz.length; j += 1) {
      const b = horiz[j];
      if (!b) continue;
      if (Math.abs(a.x0 - b.x0) > 4 || Math.abs(a.x1 - b.x1) > 4) continue;
      const height = Math.abs(a.y - b.y);
      if (height < 20) continue;
      const width = ((a.x1 - a.x0) + (b.x1 - b.x0)) / 2;
      const xL = (a.x0 + b.x0) / 2;
      const xR = (a.x1 + b.x1) / 2;
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      const covers = (edge: { y0: number; y1: number; x: number }, x: number) =>
        Math.abs(edge.x - x) <= 4 && edge.y0 <= y0 + height * 0.25 && edge.y1 >= y1 - height * 0.25;
      if (!vert.some((edge) => covers(edge, xL)) || !vert.some((edge) => covers(edge, xR))) continue;
      const rect = { centerX: (xL + xR) / 2, centerY: (y0 + y1) / 2, width, height };
      if (rects.some((kept) => Math.hypot(kept.centerX - rect.centerX, kept.centerY - rect.centerY) < 5 && Math.abs(kept.width - rect.width) < 5)) {
        continue;
      }
      rects.push(rect);
    }
  }
  return rects;
}

function fitLine(u: readonly number[], y: readonly number[]): { a: number; b: number } | null {
  const n = Math.min(u.length, y.length);
  if (n < 2) return null;
  let su = 0;
  let sy = 0;
  let suu = 0;
  let suy = 0;
  for (let i = 0; i < n; i += 1) {
    const ui = u[i] ?? 0;
    const yi = y[i] ?? 0;
    su += ui;
    sy += yi;
    suu += ui * ui;
    suy += ui * yi;
  }
  const det = n * suu - su * su;
  if (Math.abs(det) < 1e-9) return null;
  const b = (n * suy - su * sy) / det;
  const a = (sy - b * su) / n;
  return { a, b };
}
