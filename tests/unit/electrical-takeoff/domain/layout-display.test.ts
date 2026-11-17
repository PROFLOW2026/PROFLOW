import { describe, expect, it } from 'vitest';
import {
  buildDisplaySheets,
  containsModel,
  modelToPaper,
  modelViewExtent,
  projectSegments,
  viewportForMark,
  visibleViewports,
  type SheetViewport,
} from '@/modules/electrical-takeoff/domain/layout-display';

/** Paper window shared by the floor viewports in 1545-all-01 Layout1. */
function floor(id: number, vcx: number): SheetViewport {
  return {
    id,
    cx: -602.7,
    cy: 313.8,
    w: 736.1,
    h: 617.4,
    vcx,
    vcy: 2900,
    vh: 3087.4,
    twist: 0,
    on: true,
  };
}

const FLOORS = [
  floor(72, -27398.8),
  floor(64, -22363.8),
  floor(56, -17330.5),
  floor(48, -12377.1),
  floor(40, -7378.9),
  floor(32, -2473.8),
];

const SIDE: SheetViewport = {
  id: 88,
  cx: 255.3,
  cy: 342.8,
  w: 727.8,
  h: 679.2,
  vcx: -37424.7,
  vcy: 2955.5,
  vh: 3396.7,
  twist: 0,
  on: true,
};

const BROKEN: SheetViewport = {
  id: 12,
  cx: 968,
  cy: 443,
  w: 715,
  h: 875,
  vcx: 54_424_080,
  vcy: 443,
  vh: 875,
  twist: 0,
  on: true,
};

const MARKS = [
  { x: -27300, y: 2900 },
  { x: -22300, y: 2900 },
  { x: -17300, y: 2900 },
  { x: -12300, y: 2900 },
  { x: -6791, y: 3121 },
  { x: -2397, y: 2620 },
  { x: -37000, y: 2955 },
];

describe('layout display', () => {
  it('shows every floor of a stacked layout from the model, and keeps the windows selectable', () => {
    const { sheets, initialId } = buildDisplaySheets({
      spaces: ['*Model_Space', '*Paper_Space'],
      layouts: [{ name: 'Layout1', space: '*Paper_Space', viewports: [...FLOORS, SIDE, BROKEN, { ...FLOORS[0]!, id: 80 }] }],
      marks: MARKS,
      preferredName: 'Layout1',
    });
    expect(initialId).toBe('model');
    const layout = sheets.find((sheet) => sheet.label === 'Layout1');
    expect(layout).toBeTruthy();
    const stack = layout?.stacks.find((group) => group.length > 1) ?? [];
    expect(stack.map((vp) => vp.vcx)).toEqual(FLOORS.map((vp) => vp.vcx));
    expect(layout?.stacks.some((group) => group.some((vp) => vp.id === BROKEN.id))).toBe(false);
    expect(layout?.stacks.some((group) => group.length === 1 && group[0]?.id === SIDE.id)).toBe(true);
    const visible = visibleViewports(layout!, [stack[0]?.id ?? 0]);
    expect(visible.filter((vp) => stack.some((item) => item.id === vp.id))).toHaveLength(1);
    expect(containsModel(stack[0]!, -27300, 2900)).toBe(true);
    expect(containsModel(stack[0]!, -6791, 3121)).toBe(false);
  });

  it('lists one sheet per floor layout and opens the named sheet', () => {
    const window = (name: string, vcx: number): SheetViewport => ({
      id: vcx,
      cx: 200,
      cy: 150,
      w: 360,
      h: 240,
      vcx,
      vcy: 0,
      vh: 200,
      twist: 0,
      on: true,
    });
    const { sheets, initialId } = buildDisplaySheets({
      spaces: ['*Model_Space', '*Paper_Space', '*Paper_Space0', '*Paper_Space1'],
      layouts: [
        { name: 'Ground', space: '*Paper_Space', viewports: [window('Ground', 0)] },
        { name: 'Floor 1', space: '*Paper_Space0', viewports: [window('Floor 1', 5000)] },
        { name: 'Roof', space: '*Paper_Space1', viewports: [window('Roof', 10000)] },
      ],
      marks: [
        { x: 10, y: 0 },
        { x: 5010, y: 0 },
        { x: 10010, y: 0 },
      ],
      preferredName: 'layout:Floor 1',
    });
    expect(sheets.filter((sheet) => sheet.kind === 'layout').map((sheet) => sheet.label)).toEqual(['Ground', 'Floor 1', 'Roof']);
    expect(initialId).toBe('layout:Floor 1');
    expect(sheets.every((sheet) => sheet.stacks.every((stack) => stack.length === 1))).toBe(true);
  });

  it('shows two viewports on one sheet when they do not cover each other', () => {
    const left: SheetViewport = { id: 3, cx: 100, cy: 100, w: 80, h: 60, vcx: 0, vcy: 0, vh: 40, twist: 0, on: true };
    const right: SheetViewport = { id: 2, cx: 300, cy: 100, w: 80, h: 60, vcx: 400, vcy: 0, vh: 40, twist: 0, on: true };
    const overall: SheetViewport = { id: 1, cx: 200, cy: 100, w: 400, h: 200, vcx: 200, vcy: 100, vh: 200, twist: 0, on: true };
    const { sheets, initialId } = buildDisplaySheets({
      spaces: ['*Model_Space'],
      layouts: [{ name: 'Plan', space: '*Paper_Space', viewports: [overall, left, right] }],
      marks: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
      ],
      preferredName: 'Plan',
    });
    const plan = sheets.find((sheet) => sheet.id === 'layout:Plan');
    expect(initialId).toBe('layout:Plan');
    expect(visibleViewports(plan!, []).map((vp) => vp.id)).toEqual([3, 2]);
    const placed = modelToPaper(0, 0, left);
    expect(placed.x).toBeCloseTo(left.cx, 3);
    expect(placed.y).toBeCloseTo(left.cy, 3);
  });

  it('drops a segment that belongs to another floor and keeps the symbol stroke', () => {
    const vp = FLOORS[4]!;
    const symbol = modelToPaper(-6791, 3121, vp);
    const edge = (x: number, y: number) => {
      const paper = modelToPaper(x, y, vp);
      return [x, y, x + 2, y + 1, 0, 4, 0, 0, paper.x, paper.y];
    };
    const near = edge(-6791, 3121);
    const far = edge(-27300, 2900);
    const origin = [0, 0] as const;
    const segments = new Float32Array([
      near[0]! - origin[0],
      near[1]! - origin[1],
      near[2]! - origin[0],
      near[3]! - origin[1],
      0,
      4,
      0,
      0,
      far[0]! - origin[0],
      far[1]! - origin[1],
      far[2]! - origin[0],
      far[3]! - origin[1],
      0,
      9,
      0,
      0,
    ]);
    const projected = projectSegments({ segments, origin, viewports: [vp] });
    expect(projected.segments.length / 8).toBe(1);
    expect(projected.segments[5]).toBe(4);
    expect(projected.segments[0]).toBeCloseTo(symbol.x, 0);
  });

  it('ignores a huge content extent and frames the fixtures', () => {
    const extent = modelViewExtent([0, 0, 50_000_000, 50_000_000], MARKS, [0, 0]);
    expect(extent[2] - extent[0]).toBeLessThan(80_000);
    expect(extent[0]).toBeLessThan(-37000);
    expect(extent[2]).toBeGreaterThan(-2397);
  });

  it('lists every real layout when the preferred name matches none of them', () => {
    const window = (id: number, vcx: number): SheetViewport => ({
      id,
      cx: 100,
      cy: 100,
      w: 80,
      h: 60,
      vcx,
      vcy: 0,
      vh: 40,
      twist: 0,
      on: true,
    });
    const { sheets, initialId } = buildDisplaySheets({
      spaces: ['*Model_Space'],
      layouts: [
        { name: 'EL-karka', space: '*Paper_Space', viewports: [window(3, 0)] },
        { name: 'EL-k1-01', space: '*Paper_Space0', viewports: [window(3, 5000)] },
        { name: 'EL-gag', space: '*Paper_Space1', viewports: [window(3, 10000)] },
      ],
      marks: [{ x: 5000, y: 0 }],
      preferredName: 'layout:Layout1',
    });
    expect(initialId).toBe('model');
    expect(sheets.filter((sheet) => sheet.kind === 'layout').map((sheet) => sheet.label)).toEqual(['EL-karka', 'EL-k1-01', 'EL-gag']);
  });

  it('expands a content extent that leaves a floor outside the frame', () => {
    const extent = modelViewExtent([-100, -100, 100, 100], [{ x: -6791, y: 3121 }, { x: 0, y: -11917 }], [0, 0]);
    expect(extent[0]).toBeLessThan(-6791);
    expect(extent[1]).toBeLessThan(-11917);
    expect(extent[2]).toBeGreaterThan(100);
  });

  it('finds the stacked window that actually contains the fixture', () => {
    const { sheets } = buildDisplaySheets({
      spaces: ['*Model_Space'],
      layouts: [{ name: 'Layout1', space: '*Paper_Space', viewports: FLOORS }],
      marks: MARKS,
      preferredName: 'Layout1',
    });
    const layout = sheets.find((sheet) => sheet.kind === 'layout')!;
    const hit = viewportForMark(layout, -6791, 3121, []);
    expect(hit?.vcx).toBe(-7378.9);
  });
});
