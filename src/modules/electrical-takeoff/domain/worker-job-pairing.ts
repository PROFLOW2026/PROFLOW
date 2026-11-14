import type { WorkerJobRequest } from './contracts';

export type TakeoffFileForPairing = {
  id: string;
  name: string;
  kind: 'pdf' | 'dwg' | 'dxf';
};

const LEGEND_FILE_HINT = /מקרא|legend|מפתח/i;

/** Plan PDFs used for quantities — excludes legend/mkey PDFs (name heuristic; no DB role yet). */
export function isLegendPdfFile(file: Pick<TakeoffFileForPairing, 'kind' | 'name'>): boolean {
  return file.kind === 'pdf' && LEGEND_FILE_HINT.test(file.name);
}

export function isDwgLikeFile(file: Pick<TakeoffFileForPairing, 'kind'>): boolean {
  return file.kind === 'dwg' || file.kind === 'dxf';
}

export type WorkerFilePairing = WorkerJobRequest['pairing'][number];

function pairKey(p: WorkerFilePairing): string {
  return `${p.pdfFileId}:${p.dwgFileId}`;
}

export function dedupeWorkerPairings(pairs: readonly WorkerFilePairing[]): WorkerFilePairing[] {
  const seen = new Set<string>();
  const out: WorkerFilePairing[] = [];
  for (const p of pairs) {
    const k = pairKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** Cartesian product: each non-legend plan PDF × each DWG/DXF in the job. */
export function deriveAutomaticWorkerPairing(files: readonly TakeoffFileForPairing[]): WorkerFilePairing[] {
  const planPdfs = files.filter((f) => f.kind === 'pdf' && !isLegendPdfFile(f));
  const dwgs = files.filter((f) => isDwgLikeFile(f));
  const pairs: WorkerFilePairing[] = [];
  for (const pdf of planPdfs) {
    for (const dwg of dwgs) {
      pairs.push({ pdfFileId: pdf.id, dwgFileId: dwg.id });
    }
  }
  return dedupeWorkerPairings(pairs);
}

/**
 * Worker merge runs when `pairing` is non-empty. Merge explicit wizard pairs with automatic pairs
 * (deduped by pdf+dwg ids).
 */
export function resolveWorkerPairing(
  files: readonly TakeoffFileForPairing[],
  explicit?: readonly WorkerFilePairing[],
): WorkerFilePairing[] {
  const auto = deriveAutomaticWorkerPairing(files);
  if (!explicit?.length) return auto;
  return dedupeWorkerPairings([...explicit, ...auto]);
}