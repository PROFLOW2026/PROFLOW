import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { presentArchitectureColor, liftContrast, resolveArchitectureApply } from '@/modules/external-storage/ui/cad/architecture-display';
import { classifyLoadWait } from '@/modules/external-storage/ui/cad/cad-load-activity';
import { cumulativeDistance, drawingArea, drawingDistance, layersForGroup, snapToEndpoint, suggestLayerGroup } from '@/modules/external-storage/ui/cad/cad-layer-tools';
import { readCadViewPreference, writeCadViewPreference } from '@/modules/external-storage/ui/cad/cad-view-prefs';
import { CAD_VIEWER_TREES } from '@/modules/external-storage/ui/cad/cad-viewer-engines';
import { PF_CAD_TREE_ID as V1_TREE } from '@/modules/external-storage/ui/cad/pf-cad-v3/pf-cad-config';
import { PF_CAD_TREE_ID as V2_TREE } from '@/modules/external-storage/ui/cad/pf-cad/pf-cad-config';
import { PF_CAD_TREE_ID as V3_TREE } from '@/modules/external-storage/ui/cad/pf-cad-v1/pf-cad-config';
import { chooseTakeoffSheetId, focusLevel } from '@/modules/electrical-takeoff/domain/focus-level';
import { planGeometryOrModel, type DisplaySheet } from '@/modules/electrical-takeoff/domain/layout-display';
// The publish guard lives in a Node script outside the TypeScript program.
// @ts-expect-error no declaration file for the excluded script module
import { assertPublishableWasmDir, resolvePublishDir } from '../../../scripts/lib/pf-cad-wasm-target.mjs';

const FROZEN_SHA_PREFIX = 'c99c606f116937a1';

describe('dwg viewer upgrade', () => {
  it('keeps three different code trees behind the three buttons', () => {
    expect(CAD_VIEWER_TREES).toEqual({ v1: 'pf-cad-v3', v2: 'pf-cad', v3: 'pf-cad-v1' });
    expect(new Set(Object.values(CAD_VIEWER_TREES)).size).toBe(3);
    expect(V1_TREE).toBe('pf-cad-v3');
    expect(V2_TREE).toBe('pf-cad');
    expect(V3_TREE).toBe('pf-cad-v1');
  });

  it('keeps the frozen wasm hash and refuses to publish over it', () => {
    const file = path.join(process.cwd(), 'public', 'pf-cad', 'v1', 'wasm', 'pf_cad_wasm_bg.wasm');
    const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    expect(hash.startsWith(FROZEN_SHA_PREFIX)).toBe(true);
    expect(fs.statSync(file).size).toBe(4_369_229);
    expect(() => assertPublishableWasmDir('C:/app/public/pf-cad/v1/wasm')).toThrow(/frozen/);
    expect(resolvePublishDir('C:/app', '')).toBeNull();
    expect(resolvePublishDir('C:/app', 'v2')).toContain('/pf-cad/v2/wasm');
    expect(() => resolvePublishDir('C:/app', 'v1')).toThrow(/frozen/);
  });

  it('recolors only the supplied architecture sample and keeps contrast', () => {
    const dark: [number, number, number] = [0.12, 0.13, 0.14];
    const black = presentArchitectureColor([0, 0, 0, 1], { mode: 'gray', strength: 1 }, dark);
    expect(black?.[0]).toBeGreaterThan(0.3);
    const mono = presentArchitectureColor([0, 0, 0, 1], { mode: 'mono', strength: 1 }, dark);
    expect(mono).toEqual([1, 1, 1, 1]);
    const paper: [number, number, number] = [1, 1, 1];
    expect(presentArchitectureColor([1, 1, 1, 1], { mode: 'mono', strength: 1 }, paper)).toEqual([0, 0, 0, 1]);
    expect(presentArchitectureColor([0.2, 0.4, 0.9, 1], { mode: 'hidden', strength: 1 }, dark)).toBeNull();
    expect(liftContrast(0, 0.1)).toBeGreaterThan(0.3);
  });

  it('separates a long load from a stuck load and a failure', () => {
    expect(classifyLoadWait(5_000, false)).toBe('working');
    expect(classifyLoadWait(12_000, false)).toBe('long');
    expect(classifyLoadWait(45_000, false)).toBe('stuck');
    expect(classifyLoadWait(1_000, true)).toBe('failed');
  });

  it('does not treat an E layer as electrical and does not hide an unknown group', () => {
    expect(suggestLayerGroup('E-01', false)).toBe('unknown');
    expect(suggestLayerGroup('ELEC-POWER', false)).toBe('electrical');
    expect(suggestLayerGroup('xref|WALL', true)).toBe('architecture');
    const layers = [
      { index: 1, name: 'E-01' },
      { index: 2, name: 'ELEC-POWER' },
    ];
    expect(layersForGroup(layers, new Set(), 'unknown')).toEqual([]);
    expect(layersForGroup(layers, new Set(), 'electrical')).toEqual([2]);
  });

  it('stores a view preference on the device store only', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (id: string) => memory.get(id) ?? null,
      setItem: (id: string, value: string) => memory.set(id, value),
    };
    writeCadViewPreference(storage, 'doc-1', { architectureMode: 'gray', grayStrength: 0.4 });
    expect(readCadViewPreference(storage, 'doc-1')?.architectureMode).toBe('gray');
    expect(readCadViewPreference(storage, 'doc-2')).toBeNull();
  });

  it('reports drawing units without converting them', () => {
    expect(drawingDistance(0, 0, 3, 4)).toBe(5);
    expect(cumulativeDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 0 }])).toBe(9);
    expect(drawingArea([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])).toBe(4);
    const segments = new Float32Array([10, 10, 20, 10]);
    expect(snapToEndpoint(segments, 4, 10.2, 10.2, 1)).toEqual({ x: 10, y: 10 });
    expect(snapToEndpoint(segments, 4, 0, 0, 1)).toEqual({ x: 0, y: 0 });
  });

  it('focuses a known point as a point and follows the layout that contains it', () => {
    expect(focusLevel(true, true)).toBe('symbol');
    expect(focusLevel(true, false)).toBe('point');
    expect(focusLevel(false, false)).toBe('unavailable');
    const sheets: DisplaySheet[] = [
      { id: 'model', label: 'Model', kind: 'model', space: '*Model_Space', stacks: [] },
      {
        id: 'layout:EL-k1',
        label: 'EL-k1',
        kind: 'layout',
        space: '*Paper_Space1',
        stacks: [[{ id: 3, cx: 0, cy: 0, w: 100, h: 100, vcx: -2000, vcy: 2500, vh: 1000, twist: 0, on: true }]],
      },
    ];
    expect(chooseTakeoffSheetId({ sheets, initialId: 'model' }, null, null, null)).toBe('model');
    expect(chooseTakeoffSheetId({ sheets, initialId: 'model' }, 'model', null, { nativeX: -2000, nativeY: 2500 })).toBe('model');
    expect(chooseTakeoffSheetId({ sheets, initialId: 'model' }, null, 'model', { nativeX: -2000, nativeY: 2500 })).toBe('layout:EL-k1');
  });

  it('keeps an occurrence on its own layout when another paper viewport also covers the point', () => {
    const window = { id: 3, cx: 0, cy: 0, w: 100, h: 100, vcx: -2000, vcy: 2500, vh: 1000, twist: 0, on: true };
    const sheets: DisplaySheet[] = [
      { id: 'model', label: 'Model', kind: 'model', space: '*Model_Space', stacks: [] },
      { id: 'layout:IEC', label: 'IEC', kind: 'layout', space: '*Paper_IEC', stacks: [[window]] },
      { id: 'layout:F0', label: 'F0', kind: 'layout', space: '*Paper_F0', stacks: [[{ ...window, id: 4 }]] },
      { id: 'layout:SW', label: 'SW', kind: 'layout', space: '*Paper_SW', stacks: [[{ ...window, id: 5 }]] },
    ];
    const mark = { nativeX: -2000, nativeY: 2500 };
    const plan = { sheets, initialId: 'layout:F0' };
    expect(chooseTakeoffSheetId(plan, null, 'layout:IEC', mark, 'layout:F0')).toBe('layout:F0');
    expect(chooseTakeoffSheetId(plan, null, 'layout:IEC', mark)).toBe('layout:F0');
    expect(chooseTakeoffSheetId(plan, 'layout:IEC', 'layout:IEC', mark, 'layout:F0')).toBe('layout:IEC');
    expect(chooseTakeoffSheetId(plan, null, 'layout:IEC', null, 'layout:F0')).toBe('layout:F0');
  });

  it('leaves a layout that does not contain the symbol and uses one that does', () => {
    const covering = { id: 3, cx: 0, cy: 0, w: 100, h: 100, vcx: -2000, vcy: 2500, vh: 1000, twist: 0, on: true };
    const elsewhere = { id: 9, cx: 0, cy: 0, w: 100, h: 100, vcx: 9000, vcy: 9000, vh: 1000, twist: 0, on: true };
    const sheets: DisplaySheet[] = [
      { id: 'model', label: 'Model', kind: 'model', space: '*Model_Space', stacks: [] },
      { id: 'layout:EMPTY', label: 'EMPTY', kind: 'layout', space: '*Paper_EMPTY', stacks: [[elsewhere]] },
      { id: 'layout:EL-k1', label: 'EL-k1', kind: 'layout', space: '*Paper_EL', stacks: [[covering]] },
    ];
    const mark = { nativeX: -2000, nativeY: 2500 };
    expect(chooseTakeoffSheetId({ sheets, initialId: 'layout:EMPTY' }, null, null, mark, 'layout:EMPTY')).toBe('layout:EL-k1');
    expect(
      chooseTakeoffSheetId(
        { sheets: sheets.slice(0, 2), initialId: 'layout:EMPTY' },
        null,
        null,
        { nativeX: 0, nativeY: 0 },
        'layout:EMPTY',
      ),
    ).toBe('model');
  });

  it('changes the drawing only for a supported mode with known background layers', () => {
    expect(resolveArchitectureApply('gray', true, [2])).toEqual({ ok: true, mode: 'gray', indexes: [2] });
    expect(resolveArchitectureApply('mono', true, [2]).ok).toBe(true);
    expect(resolveArchitectureApply('hidden', true, [])).toEqual({ ok: false, reason: 'missing' });
    expect(resolveArchitectureApply('gray', false, [2])).toEqual({ ok: false, reason: 'unsupported' });
    expect(resolveArchitectureApply('hidden', false, [2])).toEqual({ ok: true, mode: 'hidden', indexes: [2] });
    const background = [0.12, 0.13, 0.15] as const;
    expect(presentArchitectureColor([0, 0, 1, 1], { mode: 'gray', strength: 1 }, background)).not.toEqual([0, 0, 1, 1]);
    expect(presentArchitectureColor([0, 0, 1, 1], { mode: 'hidden', strength: 1 }, background)).toBeNull();
    expect(presentArchitectureColor([0, 0, 1, 1], { mode: 'original', strength: 1 }, background)).toEqual([0, 0, 1, 1]);
  });

  it('shows the model drawing when a layout viewport projects no lines', () => {
    const model = { segments: new Float32Array([1, 2, 3, 4]) };
    const empty = { segments: new Float32Array(0) };
    expect(planGeometryOrModel('layout', empty, model.segments, model)).toBe(model);
    expect(planGeometryOrModel('layout', model, model.segments, model)).toBe(model);
    expect(planGeometryOrModel('model', empty, model.segments, model)).toBe(empty);
  });
});
