export const CODECAD_ASSET_BASE = '/cad/codecad-v0.1.0';

type CodeCadWasmModule = {
  default: (moduleOrPath?: string | URL | Request) => Promise<void>;
  session_create: (sessionId: string) => string;
  session_destroy: (sessionId: string) => string;
  session_use: (sessionId: string) => string;
  session_load_dwg: (sessionId: string, data: Uint8Array) => string;
  start_renderer: (canvas: HTMLCanvasElement, sessionId: string, rendererType: string) => string;
  stop_renderer: (rendererKey: string) => string;
  cad_call: (method: string, argsJson: string) => string;
};

let wasmReady: Promise<CodeCadWasmModule> | null = null;

function parseJsonResult(raw: string): unknown {
  const parsed = JSON.parse(raw) as { error?: string };
  if (parsed && typeof parsed === 'object' && parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

export async function loadCodeCadWasm(): Promise<CodeCadWasmModule> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const moduleUrl = `${CODECAD_ASSET_BASE}/cadview-web.js`;
      const mod = (await import(/* webpackIgnore: true */ moduleUrl)) as CodeCadWasmModule;
      await mod.default(`${CODECAD_ASSET_BASE}/cadview-web_bg.wasm`);
      return mod;
    })();
  }
  return wasmReady;
}

export type CodeCadLayerRow = { name: string; visible: boolean };

export type CodeCadSessionHandle = {
  sessionId: string;
  rendererKey: string;
  destroy: () => void;
  fitView: () => void;
  describe: () => { entities: number; layers: number };
  listLayers: () => CodeCadLayerRow[];
  setLayerVisible: (name: string, visible: boolean) => void;
};

export async function createCodeCadSession(
  canvas: HTMLCanvasElement,
  bytes: Uint8Array,
): Promise<CodeCadSessionHandle> {
  const wasm = await loadCodeCadWasm();
  const sessionId = `pf_${Math.random().toString(36).slice(2, 10)}`;

  parseJsonResult(wasm.session_create(sessionId));
  parseJsonResult(wasm.session_use(sessionId));

  const loadResult = parseJsonResult(wasm.session_load_dwg(sessionId, bytes)) as {
    ok?: boolean;
    entities?: number;
  };
  const entityCount = loadResult.entities ?? 0;
  if (entityCount <= 0) {
    parseJsonResult(wasm.session_destroy(sessionId));
    throw new Error('empty_drawing');
  }

  let rendererKey = '';
  const vello = parseJsonResult(wasm.start_renderer(canvas, sessionId, 'vello')) as {
    key?: string;
    error?: string;
  };
  if (vello.error) {
    const egui = parseJsonResult(wasm.start_renderer(canvas, sessionId, 'egui')) as {
      key?: string;
      error?: string;
    };
    if (egui.error || !egui.key) {
      parseJsonResult(wasm.session_destroy(sessionId));
      throw new Error(egui.error ?? vello.error ?? 'renderer_failed');
    }
    rendererKey = egui.key;
  } else {
    rendererKey = vello.key ?? '';
  }

  parseJsonResult(wasm.cad_call('fitView', '{}'));

  const call = (method: string, args: Record<string, unknown> = {}) =>
    parseJsonResult(wasm.cad_call(method, JSON.stringify(args)));

  return {
    sessionId,
    rendererKey,
    destroy: () => {
      if (rendererKey) {
        try {
          parseJsonResult(wasm.stop_renderer(rendererKey));
        } catch {
          /* ok */
        }
      }
      try {
        parseJsonResult(wasm.session_destroy(sessionId));
      } catch {
        /* ok */
      }
    },
    fitView: () => {
      parseJsonResult(wasm.session_use(sessionId));
      call('fitView');
    },
    describe: () => call('describe') as { entities: number; layers: number },
    listLayers: () => {
      parseJsonResult(wasm.session_use(sessionId));
      const entities = call('entities', {}) as Array<{ layer?: string }>;
      const names = new Set<string>();
      for (const entity of entities) {
        if (entity.layer?.trim()) names.add(entity.layer.trim());
      }
      return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({
        name,
        visible: true,
      }));
    },
    setLayerVisible: (name: string, visible: boolean) => {
      parseJsonResult(wasm.session_use(sessionId));
      call('setLayerVisible', { name, visible });
    },
  };
}
