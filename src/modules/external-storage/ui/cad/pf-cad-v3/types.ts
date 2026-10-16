/** Shared scene + compatibility types (projectflow-cad-engine contracts). */

export type CompatReport = {
  rendered: Record<string, number>;
  skipped: Record<string, number>;
  missingBlocks: Record<string, number>;
  xrefs: Record<string, string>;
  resolvedXrefs?: number;
  depthCut: number;
  parserErrors: number;
  fonts?: Record<string, number>;
  missingFonts?: string[];
};

export type CadLayer = {
  i: number;
  name: string;
  off: boolean;
  frozen: boolean;
};

export type CadRasterImage = {
  path: string;
  layer: number;
  c: number;
  corners: [number, number][];
  /** World-space clip polygon (XCLIP / viewport); WebGL discards fragments outside. */
  clip?: [number, number][];
};

/** One row from the DWG text style table (WASM `textStyleTable`). */
export type CadTextStyleTableEntry = {
  name: string;
  font?: string;
  big?: string;
  ttf?: string;
};

export type CadText = {
  x: number;
  y: number;
  h: number;
  r: number;
  c: number;
  layer: number;
  t: string;
  k?: string;
  ix?: number;
  iy?: number;
  ax?: number;
  ay?: number;
  ha?: number;
  va?: number;
  wf?: number;
  obl?: number;
  /** Mirror in X (WASM emits boolean; legacy may use numeric scale). */
  bx?: boolean | number;
  /** Mirror in Y (WASM emits boolean; legacy may use numeric scale). */
  by?: boolean | number;
  att?: number;
  rw?: number;
  lsf?: number;
  lines?: string[];
  /** Text style name from DWG (JSON string from WASM). */
  style?: string | number;
  invisible?: boolean;
  /** When true, stroke geometry is in the WASM segment buffer (WebGL); skip Canvas overlay. */
  gpu?: boolean;
};

export type ScenePayload = {
  schemaVersion?: number;
  space: string;
  origin: [number, number];
  /** Initial fit: main drawing content without distant outliers. */
  contentExtent?: [number, number, number, number];
  robustExtent: [number, number, number, number];
  fullExtent: [number, number, number, number];
  segmentCount: number;
  segmentStride: number;
  triangleCount?: number;
  triangleStride?: number;
  /** Count of text records also emitted as GPU stroke segments (P8). */
  gpuTexts?: number;
  /** Style name → SHX/TTF files; used to bind TRHEBTXT-style names to loaded fonts. */
  textStyleTable?: CadTextStyleTableEntry[];
  texts: CadText[];
  images?: CadRasterImage[];
  layers: CadLayer[];
  spaces: string[];
  report: CompatReport;
  error?: string;
};

export const SEGMENT_STRIDE = 8;

export type WorkerParseDep = {
  path: string;
  bytes: ArrayBuffer;
};

export type WorkerParseRequest = {
  type: 'parse';
  id: number;
  bytes: ArrayBuffer;
  space?: string;
  hostPath?: string;
  deps?: WorkerParseDep[];
  /** XREF probe: skip segment buffer transfer (report-only). */
  omitSegments?: boolean;
  /** CTB-like plot preview (display only). */
  plotMode?: boolean;
  /** Optional color-dependent plot style table bytes (from storage folder). */
  plotCtbBytes?: ArrayBuffer;
};

export type WorkerParseOk = {
  type: 'parse-ok';
  id: number;
  segments: Float32Array;
  triangles: Float32Array;
  scene: ScenePayload;
  timings: { wasmInitMs: number; parseMs: number };
};

export type WorkerParseErr = {
  type: 'parse-err';
  id: number;
  message: string;
};

export type WorkerReady = { type: 'ready' };

export type WorkerOut = WorkerReady | WorkerParseOk | WorkerParseErr;

export type WorkerIn = WorkerParseRequest;
