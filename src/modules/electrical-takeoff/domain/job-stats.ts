import type { WorkerResult } from './contracts';

export type TakeoffPersistedJobStats = Record<string, number | string | Record<string, string>>;

const PATH_KEYS = new Set([
  'path',
  'url',
  'downloadUrl',
  'href',
  'filePath',
  'relativePath',
  'xrefPath',
]);

/** Host filesystem locations must not land in result_stats. */
export function looksLikeFilesystemPath(value: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (value.startsWith('\\\\')) return true;
  if (/^\/(?:Users|home|usr|opt|var|tmp|private)\//.test(value)) return true;
  if (/[\\/].+\.(exe|dll|so|dylib|dwg|dxf)$/i.test(value)) return true;
  return false;
}

export function redactFilesystemPath(value: string): string {
  if (!looksLikeFilesystemPath(value)) return value;
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'redacted';
}

export function redactPathLikeStrings<T>(value: T, stripPathKeys = false): T {
  if (typeof value === 'string') {
    return redactFilesystemPath(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPathLikeStrings(item, stripPathKeys)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (stripPathKeys && PATH_KEYS.has(key)) continue;
      out[key] = redactPathLikeStrings(nested, stripPathKeys);
    }
    return out as T;
  }
  return value;
}

export function persistableWorkerJobStats(result: WorkerResult): TakeoffPersistedJobStats {
  const stats: TakeoffPersistedJobStats = redactPathLikeStrings({ ...(result.stats ?? {}) });
  const versions = redactPathLikeStrings(result.engineVersions ?? {});
  stats.engineVersions = versions;
  const build = versions.workerBuild;
  stats.workerBuild = typeof build === 'string' && build.length > 0 ? build : 'unknown';
  return stats;
}
