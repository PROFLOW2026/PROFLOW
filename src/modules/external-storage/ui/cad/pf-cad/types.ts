/** Shared scene + compatibility types (projectflow-cad-engine contracts). */

export type CompatReport = {
  rendered: Record<string, number>;
  skipped: Record<string, number>;
  missingBlocks: Record<string, number>;
  xrefs: Record<string, string>;
  resolvedXrefs?: number;
  depthCut: number;
  parserErrors: number;
};

export type CadLayer = {
  i: number;
  name: string;
  off: boolean;
  frozen: boolean;
};

export type CadText = {
  x: number;
  y: number;
  h: number;
  r: number;
  c: number;
  layer: number;
  t: string;
};

export type ScenePayload = {
  space: string;
  origin: [number, number];
  robustExtent: [number, number, number, number];
  fullExtent: [number, number, number, number];
  segmentCount: number;
  segmentStride: number;
  texts: CadText[];
  layers: CadLayer[];
  spaces: string[];
  report: CompatReport;
  error?: string;
};

export const SEGMENT_STRIDE = 6;

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
};

export type WorkerParseOk = {
  type: 'parse-ok';
  id: number;
  segments: Float32Array;
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
