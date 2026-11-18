import type { TakeoffActor } from './access';

type XrefRefRow = { name: string; path?: string | null; loaded: boolean };
type XrefMissingRow = { name: string; path?: string | null };

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