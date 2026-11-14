import type { WorkerJobRequest } from './contracts';
import {
  type TakeoffFileForPairing,
  type WorkerFilePairing,
  resolveWorkerPairing,
} from './worker-job-pairing';

export function corpus7155LightGSheetSelection(files: readonly TakeoffFileForPairing[]): WorkerJobRequest['sheetSelection'] {
  if (process.env.TAKEOFF_E2E_CORPUS_7155_LIGHT_G !== '1') return [];
  const legend = files.find((f) => isLegendPdfFileByName(f.name))?.id;
  const light = files.find((f) => f.name.includes('תאורה ג'))?.id;
  const dwg = files.find((f) => f.kind === 'dwg' || f.name.endsWith('.dwg'))?.id;
  if (!legend || !light || !dwg) return [];
  return [
    { fileId: legend, sheetKey: 'p1' },
    { fileId: light, sheetKey: 'p1' },
    { fileId: dwg, sheetKey: 'layout:מקרא' },
    { fileId: dwg, sheetKey: 'layout:תאורה ג' },
  ];
}

function isLegendPdfFileByName(name: string): boolean {
  return /מקרא|legend|מפתח/i.test(name);
}

export function resolveWorkerSheetSelection(
  files: readonly TakeoffFileForPairing[],
  explicit?: WorkerJobRequest['sheetSelection'],
): WorkerJobRequest['sheetSelection'] {
  if (explicit?.length) return explicit;
  const corpus = corpus7155LightGSheetSelection(files);
  return corpus.length ? corpus : [];
}

export function buildWorkerPairingAndSheetSelection(
  files: readonly TakeoffFileForPairing[],
  opts: {
    explicitPairing?: readonly WorkerFilePairing[];
    explicitSheetSelection?: WorkerJobRequest['sheetSelection'];
  },
): { pairing: WorkerFilePairing[]; sheetSelection: WorkerJobRequest['sheetSelection'] } {
  return {
    pairing: resolveWorkerPairing(files, opts.explicitPairing),
    sheetSelection: resolveWorkerSheetSelection(files, opts.explicitSheetSelection),
  };
}