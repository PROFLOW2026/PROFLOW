import type { ScenePayload } from './types';

export type CadIndexedFile = {
  name: string;
  getBytes: () => Promise<Uint8Array>;
};

export type FileIndex = {
  byRelativePath: Map<string, CadIndexedFile>;
  byRelativePathLower: Map<string, CadIndexedFile>;
  byBasename: Map<string, CadIndexedFile[]>;
  byBasenameLower: Map<string, CadIndexedFile[]>;
};

/** Lowercase forward slashes; trim and collapse `//`. */
export function normalizeCadPath(path: string): string {
  let s = path.trim().replace(/\\/g, '/');
  while (s.includes('//')) {
    s = s.replace('//', '/');
  }
  return s.toLowerCase().replace(/^\.\/+/, '');
}

/** Resolve an XREF path string against the host drawing path (mirrors wasm `normalize_xref_path`). */
export function resolveXrefPath(hostPath: string, xrefPath: string): string {
  let s = xrefPath.trim().replace(/\\/g, '/');
  while (s.includes('//')) {
    s = s.replace('//', '/');
  }
  const lower = s.toLowerCase();
  if (lower.length >= 2 && lower.charCodeAt(1) === 58) {
    return lower;
  }
  if (lower.startsWith('/')) {
    return lower;
  }
  const hostNorm = normalizeCadPath(hostPath);
  const hostDir = hostNorm.includes('/')
    ? hostNorm.slice(0, hostNorm.lastIndexOf('/'))
    : '';
  const rel = lower.replace(/^\.\/+/, '');
  if (!hostDir) {
    return rel;
  }
  return `${hostDir}/${rel}`;
}

function basenameKey(path: string): string {
  const parts = path.split('/');
  return (parts[parts.length - 1] ?? path).toLowerCase();
}

export function buildFileIndex(files: CadIndexedFile[]): FileIndex {
  const byRelativePath = new Map<string, CadIndexedFile>();
  const byRelativePathLower = new Map<string, CadIndexedFile>();
  const byBasename = new Map<string, CadIndexedFile[]>();
  const byBasenameLower = new Map<string, CadIndexedFile[]>();

  const pushBasename = (
    map: Map<string, CadIndexedFile[]>,
    key: string,
    file: CadIndexedFile,
  ) => {
    const list = map.get(key);
    if (list) {
      list.push(file);
    } else {
      map.set(key, [file]);
    }
  };

  for (const file of files) {
    const key = normalizeCadPath(file.name);
    if (!key) continue;
    byRelativePath.set(key, file);
    byRelativePathLower.set(key.toLowerCase(), file);
    const base = basenameKey(key);
    pushBasename(byBasename, base, file);
    pushBasename(byBasenameLower, base.toLowerCase(), file);
  }

  return {
    byRelativePath,
    byRelativePathLower,
    byBasename,
    byBasenameLower,
  };
}

export function lookupInIndex(
  index: FileIndex,
  hostPath: string,
  xrefPath: string,
): CadIndexedFile | null {
  const key = resolveXrefPath(hostPath, xrefPath);
  const direct = index.byRelativePath.get(key);
  if (direct) return direct;

  const lower = key.toLowerCase();
  const byLower = index.byRelativePathLower.get(lower);
  if (byLower) return byLower;

  const base = basenameKey(key);
  const hits = index.byBasenameLower.get(base);
  if (hits?.length === 1) {
    return hits[0]!;
  }

  const baseHits = index.byBasename.get(base);
  if (baseHits?.length === 1) {
    return baseHits[0]!;
  }

  return null;
}

export type XrefDepBytes = { path: string; bytes: Uint8Array };

export type ProbeParseFn = (
  hostBytes: Uint8Array,
  hostPath: string,
  deps: XrefDepBytes[],
) => Promise<ScenePayload>;

const DEFAULT_MAX_FILES = 32;
const DEFAULT_XREF_FETCH_CONCURRENCY = 4;

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next]!;
        next += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

function xrefPathsFromReport(scene: ScenePayload): string[] {
  const raw = scene.report?.xrefs ?? {};
  const paths = new Set<string>();
  for (const [blockName, value] of Object.entries(raw)) {
    const p = value.trim();
    if (p) {
      paths.add(p);
      continue;
    }
    paths.add(blockName);
    if (!blockName.toLowerCase().endsWith('.dwg')) {
      paths.add(`${blockName}.dwg`);
    }
  }
  return [...paths];
}

/**
 * Iteratively probe-parse the host and grow the dependency set until XREF paths stabilize
 * or `maxFiles` is reached.
 */
export type XrefClosureStats = {
  downloadMs: number;
};

export async function collectXrefClosure(options: {
  hostPath: string;
  hostBytes: Uint8Array;
  index: FileIndex;
  probeParse: ProbeParseFn;
  maxFiles?: number;
  fetchConcurrency?: number;
  onFetchProgress?: (loaded: number, targetBatch: number) => void;
  stats?: XrefClosureStats;
}): Promise<XrefDepBytes[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const fetchConcurrency = options.fetchConcurrency ?? DEFAULT_XREF_FETCH_CONCURRENCY;
  const depsByPath = new Map<string, Uint8Array>();
  const hostPath = normalizeCadPath(options.hostPath);

  for (let round = 0; round < maxFiles; round += 1) {
    const depsSnapshot: XrefDepBytes[] = [...depsByPath.entries()].map(
      ([path, bytes]) => ({ path, bytes }),
    );
    const scene = await options.probeParse(
      options.hostBytes,
      hostPath,
      depsSnapshot,
    );
    if (scene.error) {
      break;
    }

    const pending: { depKey: string; hit: CadIndexedFile }[] = [];
    for (const xrefPath of xrefPathsFromReport(scene)) {
      if (depsByPath.size + pending.length >= maxFiles) {
        break;
      }
      const hit = lookupInIndex(options.index, hostPath, xrefPath);
      if (!hit) continue;
      const depKey = normalizeCadPath(hit.name);
      if (depsByPath.has(depKey)) continue;
      if (pending.some((p) => p.depKey === depKey)) continue;
      pending.push({ depKey, hit });
    }

    if (pending.length === 0) {
      break;
    }

    const batchTotal = depsByPath.size + pending.length;
    await runPool(pending, fetchConcurrency, async ({ depKey, hit }) => {
      const t0 = performance.now();
      const bytes = await hit.getBytes();
      if (options.stats) {
        options.stats.downloadMs += performance.now() - t0;
      }
      depsByPath.set(depKey, bytes);
      options.onFetchProgress?.(depsByPath.size, batchTotal);
    });
  }

  return [...depsByPath.entries()].map(([path, bytes]) => ({ path, bytes }));
}
