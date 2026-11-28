import type { ScenePayload } from './types';

export type CadIndexedFile = {
  name: string;
  sizeBytes?: number | null;
  logicalId?: string;
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

  const savedHasFolder = xrefPath.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.').length > 1;
  if (savedHasFolder) return null;
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

function fileByLogicalId(index: FileIndex, logicalId: string): CadIndexedFile | null {
  for (const file of index.byRelativePath.values()) {
    if (file.logicalId === logicalId) return file;
  }
  return null;
}

export type XrefDepBytes = {
  path: string;
  bytes: Uint8Array;
  blockName?: string;
  logicalId?: string;
  parentId?: number;
};

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
  resolveMissing?: (xrefPath: string, hostPath: string) => Promise<CadIndexedFile | null>;
  fetchConcurrency?: number;
  onFetchProgress?: (loaded: number, targetBatch: number) => void;
  stats?: XrefClosureStats;
  parentIdentity?: boolean;
  hostLogicalId?: string;
  xrefChoices?: readonly { parentLogicalId: string; blockName: string; savedPath: string; logicalId: string }[];
}): Promise<XrefDepBytes[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const fetchConcurrency = options.fetchConcurrency ?? DEFAULT_XREF_FETCH_CONCURRENCY;
  const depsByPath = new Map<string, Uint8Array>();
  const parentWanted = new Map<string, { hit: CadIndexedFile; blockName: string; saved: string }>();
  const hostPath = normalizeCadPath(options.hostPath);
  const started = performance.now();
  const closureLimit = 150 * 1024 * 1024;
  const closureMs = 600_000;
  let acceptedBytes = options.hostBytes.byteLength;
  if (acceptedBytes > closureLimit) return [];

  for (let round = 0; round < maxFiles; round += 1) {
    if (performance.now() - started > closureMs) break;
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
      let hit = lookupInIndex(options.index, hostPath, xrefPath);
      if (!hit && options.resolveMissing) {
        hit = await options.resolveMissing(xrefPath, hostPath);
      }
      if (!hit) continue;
      const depKey = normalizeCadPath(hit.name);
      if (depsByPath.has(depKey)) continue;
      if (pending.some((p) => p.depKey === depKey)) continue;
      pending.push({ depKey, hit });
    }

    if (options.parentIdentity) {
      const raw = scene.report?.xrefs ?? {};
      for (const [blockName, savedRaw] of Object.entries(raw)) {
        const saved = savedRaw.trim();
        const lookup = saved || (blockName.toLowerCase().endsWith('.dwg') ? blockName : `${blockName}.dwg`);
        const choice = options.xrefChoices?.find(
          (row) => row.parentLogicalId === options.hostLogicalId && row.blockName === blockName && row.savedPath === saved,
        );
        const chosen = choice ? fileByLogicalId(options.index, choice.logicalId) : null;
        const hit = chosen ?? lookupInIndex(options.index, hostPath, lookup);
        if (!hit?.logicalId) continue;
        const key = `${blockName}\0${saved}`;
        if (!parentWanted.has(key)) parentWanted.set(key, { hit, blockName, saved });
        const depKey = normalizeCadPath(hit.name);
        if (!depsByPath.has(depKey) && !pending.some((item) => item.depKey === depKey)) {
          pending.push({ depKey, hit });
        }
      }
    }

    if (pending.length === 0) {
      break;
    }

    const batchTotal = depsByPath.size + pending.length;
    await runPool(pending, fetchConcurrency, async ({ depKey, hit }) => {
      if (performance.now() - started > closureMs) return;
      if (hit.sizeBytes != null && acceptedBytes + hit.sizeBytes > closureLimit) return;
      const t0 = performance.now();
      let bytes: Uint8Array;
      try {
        bytes = await hit.getBytes();
      } catch {
        return;
      }
      if (bytes.byteLength > 250 * 1024 * 1024) return;
      if (acceptedBytes + bytes.byteLength > closureLimit) return;
      acceptedBytes += bytes.byteLength;
      if (options.stats) {
        options.stats.downloadMs += performance.now() - t0;
      }
      depsByPath.set(depKey, bytes);
      options.onFetchProgress?.(depsByPath.size, batchTotal);
    });
  }

  if (!options.parentIdentity) {
    return [...depsByPath.entries()].map(([path, bytes]) => ({ path, bytes }));
  }
  const parentDeps: XrefDepBytes[] = [];
  for (const wanted of parentWanted.values()) {
    const bytes = depsByPath.get(normalizeCadPath(wanted.hit.name));
    if (!bytes || !wanted.hit.logicalId) continue;
    parentDeps.push({
      path: wanted.saved,
      bytes,
      blockName: wanted.blockName,
      logicalId: wanted.hit.logicalId,
      parentId: 1,
    });
  }
  return parentDeps;
}
