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
  marks: { id: string; x: number; y: number; half: number }[];
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
  const half = paper ? Math.max(8, paper.height * 0.02) : window ? Math.max(20, window.hw * 0.01) : 30;
  const draft: CadSheetFrame = {
    space: space.space,
    originX: space.origin[0],
    originY: space.origin[1],
    window,
    paper,
    scale: paper ? scale : 1,
    marks: [],
  };
  draft.marks = marks.map((mark) => {
    const world = modelToWorld(mark.nativeX, mark.nativeY, draft);
    return { id: mark.id, x: world.x, y: world.y, half };
  });
  return draft;
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
