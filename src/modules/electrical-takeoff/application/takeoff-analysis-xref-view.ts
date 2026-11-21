import type { WorkerLegendEntry } from '../domain/contracts';
import { redactPathLikeStrings, type TakeoffPersistedJobStats } from '../domain/job-stats';
import type { TakeoffActor } from './access';

type XrefRefRow = { name: string; path?: string | null; loaded: boolean };
type XrefMissingRow = { name: string; path?: string | null };

const LEGEND_PATH_KEYS = new Set([
  'path',
  'url',
  'downloadUrl',
  'href',
  'filePath',
  'relativePath',
  'xrefPath',
]);

/** Contractors must not see full storage paths from worker sheet metadata. */
export function sanitizeTakeoffSheetXrefsForActor(
  actor: TakeoffActor,
  input: { xrefRefs: readonly XrefRefRow[]; xrefsMissing: readonly XrefMissingRow[] },
): { xrefRefs: XrefRefRow[]; xrefsMissing: XrefMissingRow[] } {
  if (actor.kind === 'internal') {
    return { xrefRefs: [...input.xrefRefs], xrefsMissing: [...input.xrefsMissing] };
  }
  return {
    xrefRefs: input.xrefRefs.map((row) => ({
      name: row.name,
      path: null,
      loaded: row.loaded,
    })),
    xrefsMissing: input.xrefsMissing.map((row) => ({
      name: row.name,
      path: null,
    })),
  };
}

/** Legend text is drawing content. Paths and download URLs are not. */
export function sanitizeTakeoffLegendForActor(
  actor: TakeoffActor,
  entries: readonly WorkerLegendEntry[],
): WorkerLegendEntry[] {
  if (actor.kind === 'internal') return entries.map((row) => ({ ...row }));
  return entries.map((row) => {
    const copy: WorkerLegendEntry = { ...row };
    for (const key of Object.keys(copy) as Array<keyof WorkerLegendEntry>) {
      if (LEGEND_PATH_KEYS.has(String(key))) {
        delete copy[key];
      }
    }
    if (copy.previewArtifact && /[\\/]|\.dwg|\.dxf/i.test(copy.previewArtifact)) {
      copy.previewArtifact = null;
    }
    return copy;
  });
}

/** Job stats may include engineVersions. Contractors never receive host paths or XREF paths. */
export function sanitizeTakeoffWorkerStatsForActor(
  actor: TakeoffActor,
  stats: TakeoffPersistedJobStats,
): TakeoffPersistedJobStats {
  return redactPathLikeStrings(stats, actor.kind !== 'internal');
}