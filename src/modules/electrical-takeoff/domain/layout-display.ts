/**
 * How a takeoff drawing is shown. Counting stays in the worker: a symbol that
 * appears in several viewports is still one stored detection. This module only
 * decides which sheet and which window the viewer draws.
 */

export type SheetViewport = {
  id: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  vcx: number;
  vcy: number;
  vh: number;
  twist: number;
  on: boolean;
};

export type LayoutSource = {
  name: string;
  space: string;
  viewports: readonly SheetViewport[];
};

export type DisplaySheet = {
  id: string;
  label: string;
  kind: 'model' | 'layout';
  space: string;
  /** Viewports drawn together. A stack longer than one is a picker, one window at a time. */
  stacks: SheetViewport[][];
};

export type PlanPoint = { x: number; y: number };

const OVERLAP_STACK = 0.55;

export function isIdentityViewport(vp: SheetViewport): boolean {
  if (!(vp.h > 1)) return false;
  return (
    Math.abs(vp.vcx - vp.cx) < 5 &&
    Math.abs(vp.vcy - vp.cy) < 5 &&
    Math.abs(vp.vh - vp.h) / vp.h < 0.08
  );
}

export function modelHalf(vp: SheetViewport): { hw: number; hh: number } {
  const scale = vp.h / vp.vh;
  return { hw: vp.w / 2 / scale, hh: vp.h / 2 / scale };
}

/** True when a model-space point is inside this viewport's model window. */
export function containsModel(vp: SheetViewport, x: number, y: number): boolean {
  if (!(vp.vh > 0) || !(vp.h > 0)) return false;
  const dx = x - vp.vcx;
  const dy = y - vp.vcy;
  const c = Math.cos(vp.twist);
  const s = Math.sin(vp.twist);
  const rx = c * dx - s * dy;
  const ry = s * dx + c * dy;
  const { hw, hh } = modelHalf(vp);
  return Math.abs(rx) <= hw + 1e-6 && Math.abs(ry) <= hh + 1e-6;
}

/** Paper point for a model point, using the same transform as the CAD engine. */
export function modelToPaper(x: number, y: number, vp: SheetViewport): PlanPoint {
  const dx = x - vp.vcx;
  const dy = y - vp.vcy;
  const c = Math.cos(vp.twist);
  const s = Math.sin(vp.twist);
  const scale = vp.h / vp.vh;
  return {
    x: vp.cx + scale * (c * dx - s * dy),
    y: vp.cy + scale * (s * dx + c * dy),
  };
}

function paperBox(vp: SheetViewport): { x0: number; y0: number; x1: number; y1: number; area: number } {
  const x0 = vp.cx - vp.w / 2;
  const y0 = vp.cy - vp.h / 2;
  const x1 = vp.cx + vp.w / 2;
  const y1 = vp.cy + vp.h / 2;
  return { x0, y0, x1, y1, area: Math.max(vp.w, 0) * Math.max(vp.h, 0) };
}

export function paperOverlapRatio(left: SheetViewport, right: SheetViewport): number {
  const a = paperBox(left);
  const b = paperBox(right);
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const minArea = Math.min(a.area, b.area);
  if (!(minArea > 0)) return 0;
  return (ix * iy) / minArea;
}

function usable(vp: SheetViewport): boolean {
  if (!vp.on || vp.id === 1 || !(vp.w > 1) || !(vp.h > 1) || !(vp.vh > 1)) return false;
  if (!Number.isFinite(vp.vcx) || !Number.isFinite(vp.vcy) || Math.abs(vp.vcx) > 1_000_000 || Math.abs(vp.vcy) > 1_000_000) return false;
  return !isIdentityViewport(vp);
}

function dedupe(viewports: readonly SheetViewport[]): SheetViewport[] {
  const kept: SheetViewport[] = [];
  for (const vp of viewports) {
    const duplicate = kept.some(
      (other) =>
        Math.abs(other.vcx - vp.vcx) < 1 &&
        Math.abs(other.vcy - vp.vcy) < 1 &&
        Math.abs(other.vh - vp.vh) < 1 &&
        paperOverlapRatio(other, vp) >= 0.9,
    );
    if (!duplicate) kept.push(vp);
  }
  return kept;
}

function groupStacks(viewports: readonly SheetViewport[]): SheetViewport[][] {
  const parent = viewports.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index] ?? index)));
  for (let i = 0; i < viewports.length; i += 1) {
    for (let j = i + 1; j < viewports.length; j += 1) {
      const left = viewports[i];
      const right = viewports[j];
      if (left && right && paperOverlapRatio(left, right) >= OVERLAP_STACK) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, SheetViewport[]>();
  viewports.forEach((vp, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(vp);
    else groups.set(root, [vp]);
  });
  return [...groups.values()].map((group) => group.slice().sort((a, b) => a.vcx - b.vcx || a.id - b.id));
}

function relevantViewports(viewports: readonly SheetViewport[]): SheetViewport[] {
  // A layout stays visible even when this analysis has no fixture inside it.
  // Counting never uses this list: the same model point on two sheets is still one detection.
  return dedupe(viewports.filter(usable));
}

function namesMatch(label: string, preferred: string): boolean {
  const wanted = preferred.trim().toLowerCase();
  const name = label.trim().toLowerCase();
  if (!wanted || !name) return false;
  return wanted === name || wanted.includes(name);
}

export function buildDisplaySheets(input: {
  spaces: readonly string[];
  layouts: readonly LayoutSource[];
  marks: readonly PlanPoint[];
  preferredName: string;
}): { sheets: DisplaySheet[]; initialId: string } {
  const modelSpace = input.spaces.find((space) => space.toLowerCase().includes('model')) ?? '*Model_Space';
  const sheets: DisplaySheet[] = [
    { id: 'model', label: 'Model', kind: 'model', space: modelSpace, stacks: [] },
  ];
  for (const layout of input.layouts) {
    const stacks = groupStacks(relevantViewports(layout.viewports));
    if (stacks.length === 0) continue;
    const id = `layout:${layout.name}`;
    sheets.push({ id, label: layout.name, kind: 'layout', space: layout.space, stacks });
  }
  const named = sheets.find((sheet) => sheet.kind === 'layout' && namesMatch(sheet.label, input.preferredName));
  const namedStacked = named?.stacks.some((stack) => stack.length > 1) ?? false;
  // An unmatched name, or a stack of floors on one sheet, opens the model so every plan is in view.
  const initialId = named && !namedStacked ? named.id : 'model';
  return { sheets, initialId };
}

export function visibleViewports(sheet: DisplaySheet, activeIds: readonly number[]): SheetViewport[] {
  return sheet.stacks.map((stack) => {
    if (stack.length === 1) return stack[0] ?? null;
    return stack.find((vp) => activeIds.includes(vp.id)) ?? stack[0] ?? null;
  }).filter((vp): vp is SheetViewport => vp !== null);
}

export function viewportForMark(sheet: DisplaySheet, x: number, y: number, activeIds: readonly number[]): SheetViewport | null {
  const visible = visibleViewports(sheet, activeIds);
  const shown = visible.find((vp) => containsModel(vp, x, y));
  if (shown) return shown;
  for (const stack of sheet.stacks) {
    const hit = stack.find((vp) => containsModel(vp, x, y));
    if (hit) return hit;
  }
  return null;
}

export type Extent = readonly [number, number, number, number];

export function paperExtent(viewports: readonly SheetViewport[], padRatio = 0.04): Extent {
  if (viewports.length === 0) return [0, 0, 1, 1];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const vp of viewports) {
    const box = paperBox(vp);
    minX = Math.min(minX, box.x0);
    minY = Math.min(minY, box.y0);
    maxX = Math.max(maxX, box.x1);
    maxY = Math.max(maxY, box.y1);
  }
  const padX = Math.max((maxX - minX) * padRatio, 1);
  const padY = Math.max((maxY - minY) * padRatio, 1);
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
}

/**
 * Model fit. Prefer the engine content extent. If that extent is many times
 * larger than the fixtures, the file has distant junk and the fixtures' own
 * span is the plan.
 */
export function modelViewExtent(content: Extent | undefined, marks: readonly PlanPoint[], origin: readonly [number, number]): Extent {
  if (marks.length === 0) return content ?? [0, 0, 1, 1];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const mark of marks) {
    const x = mark.x - origin[0];
    const y = mark.y - origin[1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const markBox: Extent = [minX - spanX * 0.12, minY - spanY * 0.12, maxX + spanX * 0.12, maxY + spanY * 0.12];
  if (!content) return markBox;
  const contentW = content[2] - content[0];
  const contentH = content[3] - content[1];
  if (contentW > spanX * 8 || contentH > spanY * 8) return markBox;
  const covers = content[0] <= minX && content[2] >= maxX && content[1] <= minY && content[3] >= maxY;
  if (!covers) {
    return [
      Math.min(content[0], markBox[0]),
      Math.min(content[1], markBox[1]),
      Math.max(content[2], markBox[2]),
      Math.max(content[3], markBox[3]),
    ];
  }
  return content;
}

function clipSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): [number, number, number, number] | null {
  const out = (x: number, y: number) => (x < minX ? 1 : 0) | (x > maxX ? 2 : 0) | (y < minY ? 4 : 0) | (y > maxY ? 8 : 0);
  let codeA = out(x1, y1);
  let codeB = out(x2, y2);
  let ax = x1;
  let ay = y1;
  let bx = x2;
  let by = y2;
  for (let step = 0; step < 8; step += 1) {
    if ((codeA | codeB) === 0) return [ax, ay, bx, by];
    if ((codeA & codeB) !== 0) return null;
    const code = codeA !== 0 ? codeA : codeB;
    let x = 0;
    let y = 0;
    if (code & 8) {
      x = ax + ((bx - ax) * (maxY - ay)) / (by - ay);
      y = maxY;
    } else if (code & 4) {
      x = ax + ((bx - ax) * (minY - ay)) / (by - ay);
      y = minY;
    } else if (code & 2) {
      y = ay + ((by - ay) * (maxX - ax)) / (bx - ax);
      x = maxX;
    } else {
      y = ay + ((by - ay) * (minX - ax)) / (bx - ax);
      x = minX;
    }
    if (code === codeA) {
      ax = x;
      ay = y;
      codeA = out(ax, ay);
    } else {
      bx = x;
      by = y;
      codeB = out(bx, by);
    }
  }
  return null;
}

/** Project model-space segments through the visible viewports. One scan, no second file parse. */
export function projectSegments(input: {
  segments: Float32Array;
  triangles?: Float32Array;
  stride?: number;
  triangleStride?: number;
  origin: readonly [number, number];
  viewports: readonly SheetViewport[];
}): { segments: Float32Array; triangles: Float32Array; extent: Extent } {
  const stride = input.stride ?? 8;
  const triStride = input.triangleStride ?? 10;
  const originX = input.origin[0];
  const originY = input.origin[1];
  const lines: number[] = [];
  const tris: number[] = [];
  for (const vp of input.viewports) {
    const box = paperBox(vp);
    const { hw, hh } = modelHalf(vp);
    const reach = Math.hypot(hw, hh) + 1;
    for (let i = 0; i + stride - 1 < input.segments.length; i += stride) {
      const ax = (input.segments[i] ?? 0) + originX;
      const ay = (input.segments[i + 1] ?? 0) + originY;
      const bx = (input.segments[i + 2] ?? 0) + originX;
      const by = (input.segments[i + 3] ?? 0) + originY;
      if (ax < vp.vcx - reach && bx < vp.vcx - reach) continue;
      if (ax > vp.vcx + reach && bx > vp.vcx + reach) continue;
      if (ay < vp.vcy - reach && by < vp.vcy - reach) continue;
      if (ay > vp.vcy + reach && by > vp.vcy + reach) continue;
      const a = modelToPaper(ax, ay, vp);
      const b = modelToPaper(bx, by, vp);
      const clipped = clipSegment(a.x, a.y, b.x, b.y, box.x0, box.y0, box.x1, box.y1);
      if (!clipped) continue;
      lines.push(clipped[0], clipped[1], clipped[2], clipped[3], input.segments[i + 4] ?? 0, input.segments[i + 5] ?? 0, input.segments[i + 6] ?? 0, input.segments[i + 7] ?? 0);
    }
    const triangles = input.triangles;
    if (!triangles) continue;
    for (let i = 0; i + triStride - 1 < triangles.length; i += triStride) {
      const points = [0, 1, 2].map((corner) =>
        modelToPaper((triangles[i + corner * 2] ?? 0) + originX, (triangles[i + corner * 2 + 1] ?? 0) + originY, vp),
      );
      if (!points.some((point) => point.x >= box.x0 && point.x <= box.x1 && point.y >= box.y0 && point.y <= box.y1)) continue;
      tris.push(
        points[0]?.x ?? 0,
        points[0]?.y ?? 0,
        points[1]?.x ?? 0,
        points[1]?.y ?? 0,
        points[2]?.x ?? 0,
        points[2]?.y ?? 0,
        triangles[i + 6] ?? 0,
        triangles[i + 7] ?? 0,
        triangles[i + 8] ?? 0,
        triangles[i + 9] ?? 0,
      );
    }
  }
  return {
    segments: Float32Array.from(lines),
    triangles: Float32Array.from(tris),
    extent: paperExtent(input.viewports),
  };
}
