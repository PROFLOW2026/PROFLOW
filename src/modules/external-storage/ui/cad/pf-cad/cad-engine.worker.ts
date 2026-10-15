import { PF_CAD_WASM_BINARY_URL, PF_CAD_WASM_GLUE_URL } from './pf-cad-config';
import type { ScenePayload } from './types';
import type { WorkerIn, WorkerOut } from './types';

type WasmApi = {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  build_dl: (ptr: number, len: number) => number;
  json_len: () => number;
  json_ptr: () => number;
  segs_ptr: () => number;
  set_space: (ptr: number, len: number) => void;
  clear_xref_deps: () => void;
  set_host_path: (ptr: number, len: number) => void;
  add_xref_dep: (
    pathPtr: number,
    pathLen: number,
    dataPtr: number,
    dataLen: number,
  ) => number;
};

type WasmInitModule = {
  default: (opts?: { module_or_path?: string }) => Promise<WasmApi>;
};

let wasm: WasmApi | null = null;
let wasmInitMs = 0;

function reply(msg: WorkerOut): void {
  self.postMessage(msg);
}

async function ensureWasm(): Promise<WasmApi> {
  if (wasm) return wasm;
  const t0 = performance.now();
  const mod = (await import(
    /* webpackIgnore: true */
    PF_CAD_WASM_GLUE_URL
  )) as WasmInitModule;
  wasm = await mod.default({ module_or_path: PF_CAD_WASM_BINARY_URL });
  wasmInitMs = performance.now() - t0;
  return wasm;
}

function writeUtf8(w: WasmApi, text: string): { ptr: number; len: number } {
  const bytes = new TextEncoder().encode(text);
  const ptr = w.alloc(bytes.length);
  new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
  return { ptr, len: bytes.length };
}

function applyXrefDeps(
  w: WasmApi,
  hostPath: string | undefined,
  deps: Array<{ path: string; bytes: ArrayBuffer }> | undefined,
): void {
  w.clear_xref_deps();
  if (hostPath) {
    const hp = writeUtf8(w, hostPath);
    w.set_host_path(hp.ptr, hp.len);
  } else {
    w.set_host_path(w.alloc(0), 0);
  }
  for (const dep of deps ?? []) {
    const pathUtf = writeUtf8(w, dep.path);
    const data = new Uint8Array(dep.bytes);
    const dataPtr = w.alloc(data.length);
    new Uint8Array(w.memory.buffer, dataPtr, data.length).set(data);
    const rc = w.add_xref_dep(pathUtf.ptr, pathUtf.len, dataPtr, data.length);
    if (rc !== 0) {
      throw new Error(`add_xref_dep failed (${rc}) for ${dep.path}`);
    }
  }
}

function decodeJson(w: WasmApi): ScenePayload {
  const len = w.json_len();
  const bytes = new Uint8Array(w.memory.buffer, w.json_ptr(), len);
  return JSON.parse(new TextDecoder().decode(bytes)) as ScenePayload;
}

reply({ type: 'ready' });

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const req = event.data;
  if (!req || req.type !== 'parse') return;

  try {
    const w = await ensureWasm();
    const t0 = performance.now();
    applyXrefDeps(w, req.hostPath, req.deps);
    const bytes = new Uint8Array(req.bytes);
    const space = req.space ?? '';
    if (space) {
      const sb = new TextEncoder().encode(space);
      const sp = w.alloc(sb.length);
      new Uint8Array(w.memory.buffer, sp, sb.length).set(sb);
      w.set_space(sp, sb.length);
    } else {
      w.set_space(w.alloc(0), 0);
    }
    const ptr = w.alloc(bytes.length);
    new Uint8Array(w.memory.buffer, ptr, bytes.length).set(bytes);
    const nFloats = w.build_dl(ptr, bytes.length);
    const omitSegments = req.omitSegments === true;
    let segments = new Float32Array(0);
    if (!omitSegments && nFloats > 0) {
      segments = new Float32Array(w.memory.buffer, w.segs_ptr(), nFloats).slice();
    }
    const scene = decodeJson(w);
    if (omitSegments) {
      scene.texts = [];
    }
    const parseMs = performance.now() - t0;

    if (scene.error) {
      reply({ type: 'parse-err', id: req.id, message: scene.error });
      return;
    }

    const payload = {
      type: 'parse-ok' as const,
      id: req.id,
      segments,
      scene,
      timings: { wasmInitMs, parseMs },
    };
    const transfer: Transferable[] =
      segments.byteLength > 0 ? [segments.buffer] : [];
    if (transfer.length > 0) {
      (self as unknown as Worker).postMessage(payload satisfies WorkerOut, transfer);
    } else {
      (self as unknown as Worker).postMessage(payload satisfies WorkerOut);
    }
  } catch (e) {
    reply({
      type: 'parse-err',
      id: req.id,
      message: e instanceof Error ? e.message : 'Parse failed',
    });
  }
};
