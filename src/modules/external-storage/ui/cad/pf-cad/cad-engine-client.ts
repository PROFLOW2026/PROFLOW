import type {
  ScenePayload,
  WorkerIn,
  WorkerOut,
  WorkerParseDep,
  WorkerParseOk,
} from './types';
import {
  collectXrefClosure,
  normalizeCadPath,
  type FileIndex,
  type XrefDepBytes,
} from './xref-resolver';

export type ParseProgressPhase =
  | 'downloadHost'
  | 'downloadXref'
  | 'wasm'
  | 'xref'
  | 'parse'
  | 'gpu';

export type ParseProgress = {
  phase: ParseProgressPhase;
  /** Overall load progress 0–1 for UI. */
  ratio: number;
  detail?: string;
};

export type CadLoadTimings = {
  downloadHostMs?: number;
  downloadXrefMs: number;
  xrefProbeMs: number;
  xrefProbeCount: number;
  wasmInitMs: number;
  finalParseMs: number;
  totalParseMs: number;
  timeToFirstFrameMs?: number;
};

export type CadEngineClientCallbacks = {
  onProgress?: (progress: ParseProgress) => void;
  onReady?: (scene: ScenePayload) => void;
  onError?: (message: string, detail?: string) => void;
  onTimings?: (timings: CadLoadTimings) => void;
};

let requestCounter = 0;

function nextId(): number {
  requestCounter += 1;
  return requestCounter;
}

function isWorkerOut(data: unknown): data is WorkerOut {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string'
  );
}

function depsToWire(deps: XrefDepBytes[]): WorkerParseDep[] {
  return deps.map((d) => ({
    path: d.path,
    bytes: d.bytes.buffer.slice(
      d.bytes.byteOffset,
      d.bytes.byteOffset + d.bytes.byteLength,
    ) as ArrayBuffer,
  }));
}

const PHASE_WEIGHT = {
  wasm: [0.08, 0.18] as const,
  xref: [0.18, 0.52] as const,
  parse: [0.52, 0.98] as const,
  gpu: [0.98, 1] as const,
};

function lerpPhase(
  phase: keyof typeof PHASE_WEIGHT,
  localRatio: number,
  callbacks: CadEngineClientCallbacks,
  detail?: string,
): void {
  const [a, b] = PHASE_WEIGHT[phase];
  callbacks.onProgress?.({
    phase: phase === 'xref' ? 'xref' : phase,
    ratio: a + (b - a) * Math.min(1, Math.max(0, localRatio)),
    detail,
  });
}

export class CadEngineClient {
  /** Last XREF dependency set from closure (for layout re-parse). */
  lastDeps: XrefDepBytes[] = [];
  lastTimings: CadLoadTimings | null = null;
  private worker: Worker | null = null;
  private workerReady: Promise<void> | null = null;
  private wasmInitMs = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: WorkerParseOk) => void;
      reject: (e: Error) => void;
      notifyReady: boolean;
    }
  >();

  constructor(private callbacks: CadEngineClientCallbacks = {}) {}

  private ensureWorker(): Worker {
    if (!this.worker) {
      lerpPhase('wasm', 0, this.callbacks);
      this.worker = new Worker(new URL('./cad-engine.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.workerReady = new Promise((resolve, reject) => {
        const onFirst = (event: MessageEvent<unknown>) => {
          const data = event.data;
          if (isWorkerOut(data) && data.type === 'ready') {
            this.worker?.removeEventListener('message', onFirst);
            lerpPhase('wasm', 1, this.callbacks);
            resolve();
          } else if (isWorkerOut(data) && data.type === 'parse-err') {
            reject(new Error(data.message));
          }
        };
        this.worker?.addEventListener('message', onFirst);
      });

      this.worker.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (!isWorkerOut(data)) return;

        if (data.type === 'parse-ok') {
          this.wasmInitMs = Math.max(this.wasmInitMs, data.timings.wasmInitMs);
          const waiter = this.pending.get(data.id);
          if (waiter?.notifyReady) {
            this.callbacks.onReady?.(data.scene);
          }
          if (waiter) {
            this.pending.delete(data.id);
            waiter.resolve(data);
          }
          return;
        }

        if (data.type === 'parse-err') {
          this.callbacks.onError?.(data.message);
          const waiter = this.pending.get(data.id);
          if (waiter) {
            this.pending.delete(data.id);
            waiter.reject(new Error(data.message));
          }
        }
      };

      this.worker.onerror = () => {
        this.callbacks.onError?.(
          'CAD worker crashed',
          'Restart by opening the file again.',
        );
      };
    }
    return this.worker;
  }

  private async postParse(
    request: WorkerIn,
    transfer: Transferable[],
    notifyReady: boolean,
  ): Promise<WorkerParseOk> {
    const worker = this.ensureWorker();
    await this.workerReady;
    return new Promise((resolve, reject) => {
      if (request.type !== 'parse') {
        reject(new Error('Only parse requests are supported'));
        return;
      }
      this.pending.set(request.id, { resolve, reject, notifyReady });
      if (transfer.length > 0) {
        worker.postMessage(request, transfer);
      } else {
        worker.postMessage(request);
      }
    });
  }

  private async probeScene(
    hostBytes: Uint8Array,
    hostPath: string,
    deps: XrefDepBytes[],
  ): Promise<WorkerParseOk> {
    const id = nextId();
    const wireDeps = depsToWire(deps);
    const hostBuffer = hostBytes.buffer.slice(
      hostBytes.byteOffset,
      hostBytes.byteOffset + hostBytes.byteLength,
    ) as ArrayBuffer;
    const transfer: Transferable[] = [hostBuffer, ...wireDeps.map((d) => d.bytes)];
    return this.postParse(
      {
        type: 'parse',
        id,
        bytes: hostBuffer,
        hostPath,
        deps: wireDeps,
        space: '',
        omitSegments: true,
      },
      transfer,
      false,
    );
  }

  async parseDwgFromStorage(input: {
    fileName: string;
    hostBytes: Uint8Array;
    fileIndex: FileIndex;
    space?: string;
    skipXrefClosure?: boolean;
    cachedDeps?: XrefDepBytes[];
  }): Promise<WorkerParseOk> {
    const hostPath = normalizeCadPath(input.fileName);
    const hostBytes = input.hostBytes;

    let xrefProbeMs = 0;
    let xrefProbeCount = 0;
    let downloadXrefMs = 0;
    let totalParseMs = 0;
    const xrefStats = { downloadMs: 0 };

    const deps =
      input.cachedDeps ??
      (input.skipXrefClosure
        ? []
        : await (async () => {
            lerpPhase('xref', 0, this.callbacks);
            const closure = await collectXrefClosure({
              hostPath,
              hostBytes,
              index: input.fileIndex,
              stats: xrefStats,
              onFetchProgress: (loaded, total) => {
                lerpPhase('xref', total > 0 ? loaded / total : 0.5, this.callbacks, `${loaded}/${total}`);
              },
              probeParse: async (bytes, path, closureDeps) => {
                const t0 = performance.now();
                const res = await this.probeScene(bytes, path, closureDeps);
                xrefProbeMs += performance.now() - t0;
                xrefProbeCount += 1;
                totalParseMs += res.timings.parseMs;
                const local = res.timings.parseMs;
                lerpPhase(
                  'xref',
                  Math.min(0.85, 0.15 + xrefProbeCount * 0.12 + local / 8000),
                  this.callbacks,
                );
                return res.scene;
              },
              fetchConcurrency: 4,
            });
            downloadXrefMs = xrefStats.downloadMs;
            return closure;
          })());

    this.lastDeps = deps;
    lerpPhase('parse', 0, this.callbacks);
    const id = nextId();
    const wireDeps = depsToWire(deps);
    const hostBuffer = hostBytes.buffer.slice(
      hostBytes.byteOffset,
      hostBytes.byteOffset + hostBytes.byteLength,
    ) as ArrayBuffer;
    const transfer: Transferable[] = [hostBuffer, ...wireDeps.map((d) => d.bytes)];
    const res = await this.postParse(
      {
        type: 'parse',
        id,
        bytes: hostBuffer,
        hostPath,
        deps: wireDeps,
        space: input.space ?? '',
      },
      transfer,
      true,
    );
    totalParseMs += res.timings.parseMs;
    lerpPhase('parse', 1, this.callbacks);
    this.callbacks.onProgress?.({ phase: 'gpu', ratio: 1 });

    const timings: CadLoadTimings = {
      downloadXrefMs,
      xrefProbeMs,
      xrefProbeCount,
      wasmInitMs: Math.max(this.wasmInitMs, res.timings.wasmInitMs),
      finalParseMs: res.timings.parseMs,
      totalParseMs,
    };
    this.lastTimings = timings;
    this.callbacks.onTimings?.(timings);

    if (res.scene.error) {
      throw new Error(res.scene.error);
    }
    return res;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = null;
    this.pending.clear();
  }
}

export type { FileIndex };
