import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chooseCadSheetFrame, symbolInkCount } from '@/modules/electrical-takeoff/domain/cad-sheet-frame';
import type { ScenePayload } from '@/modules/external-storage/ui/cad/pf-cad-v3/types';

const DWG = 'C:/Users/ERAN YOSEF/OneDrive - MTH H.Y ELECTRICAL ENGINEERING/תוכניות ביצוע/פרוייקטים שהסתיימו/בית שלמה/2597 BID/E-1-ELC.dwg';

const SAMPLES = [
  { id: 'l39-0', nativeX: 2842.33, nativeY: 867.45, previewX: 4900.19, previewY: 1905.38 },
  { id: 'l39-9', nativeX: 2499.32, nativeY: 374.24, previewX: 4248.33, previewY: 2842.65 },
  { id: 'l39-20', nativeX: 1561.76, nativeY: 635.29, previewX: 2466.57, previewY: 2346.56 },
  { id: 'l39-30', nativeX: 1012.45, nativeY: 147.08, previewX: 1422.65, previewY: 3274.33 },
  { id: 'l39-40', nativeX: 2204.81, nativeY: 248.29, previewX: 3688.64, previewY: 3082.0 },
];

type WasmApi = {
  alloc: (n: number) => number;
  memory: { buffer: ArrayBuffer };
  set_space: (ptr: number, len: number) => void;
  build_dl: (ptr: number, len: number) => number;
  segs_ptr: () => number;
  json_ptr: () => number;
  json_len: () => number;
};

async function loadWasm(): Promise<WasmApi> {
  const root = path.resolve('public/pf-cad/v3/wasm/pf_cad_wasm.js');
  const glue = (await import(pathToFileURL(root).href)) as { initSync: (input: { module: Buffer }) => WasmApi };
  return glue.initSync({ module: fs.readFileSync(path.resolve('public/pf-cad/v3/wasm/pf_cad_wasm_bg.wasm')) });
}

function parseSpace(wasm: WasmApi, bytes: Buffer, space: string) {
  const encoded = new TextEncoder().encode(space);
  const spacePtr = wasm.alloc(encoded.length);
  new Uint8Array(wasm.memory.buffer, spacePtr, encoded.length).set(encoded);
  wasm.set_space(spacePtr, encoded.length);
  const filePtr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, filePtr, bytes.length).set(bytes);
  const floats = wasm.build_dl(filePtr, bytes.length);
  const segments = new Float32Array(wasm.memory.buffer, wasm.segs_ptr(), floats).slice();
  const scene = JSON.parse(
    new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, wasm.json_ptr(), wasm.json_len())),
  ) as ScenePayload;
  return {
    space: scene.space,
    origin: scene.origin,
    segments,
    texts: scene.texts.map((text) => text.t),
  };
}

describe('E-1-ELC sheet 101 on the existing DWG viewer coordinates', () => {
  const available = fs.existsSync(DWG);

  it.skipIf(!available)('places several l39 inserts on paper space *Paper_Space without a second parse', async () => {
    const wasm = await loadWasm();
    const bytes = fs.readFileSync(DWG);
    const model = parseSpace(wasm, bytes, '');
    const spaces = model.texts.length >= 0 ? [model] : [];
    const listed = JSON.parse(
      new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, wasm.json_ptr(), wasm.json_len())),
    ) as ScenePayload;
    for (const space of listed.spaces ?? []) {
      if (space === model.space) continue;
      spaces.push(parseSpace(wasm, bytes, space));
    }
    const input = {
      sheetKey: 'layout:101',
      sheetName: '101',
      kind: 'dwg_layout' as const,
      widthPx: 6000,
      heightPx: 3871,
      samples: SAMPLES,
      marks: SAMPLES.map(({ id, nativeX, nativeY }) => ({ id, nativeX, nativeY })),
      spaces,
    };
    const first = chooseCadSheetFrame(input);
    const second = chooseCadSheetFrame(input);
    expect(first?.space).toBe('*Paper_Space');
    expect(second?.marks.map((mark) => [mark.x, mark.y])).toEqual(first?.marks.map((mark) => [mark.x, mark.y]));
    const paper = spaces.find((space) => space.space === '*Paper_Space');
    expect(paper).toBeTruthy();
    for (const mark of first?.marks ?? []) {
      expect(symbolInkCount(paper!.segments, mark.x, mark.y, 8)).toBeGreaterThanOrEqual(8);
    }
  }, 30000);
});
