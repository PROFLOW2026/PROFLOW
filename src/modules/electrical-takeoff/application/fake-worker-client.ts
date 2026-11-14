import type { TakeoffWorkerClient } from '../ports';
import type { WorkerJobRequest, WorkerResult } from '../domain/contracts';
import { TAKEOFF_CONTRACT_VERSION } from '../domain/contracts';
import type { DbExecutor } from '@/shared/db/types';
import { applyWorkerProgress, applyWorkerResult } from './worker-callbacks';

export async function ingestFakeWorkerResult(db: DbExecutor, request: WorkerJobRequest): Promise<void> {
  await applyWorkerProgress(db, request.jobId, {
    jobId: request.jobId,
    stage: 'extract',
    percent: 50,
    message: 'fake worker',
  });
  const detections = request.files.map((file, index) => ({
    id: `${file.fileId}#${index + 1}`,
    sheetKey: 'p1',
    fileId: file.fileId,
    source: file.kind === 'pdf' ? ('pdf' as const) : ('dwg' as const),
    x: 10,
    y: 10,
    w: 5,
    h: 5,
    signature: 'shape:fake',
    signatureKind: 'pdf-shape' as const,
    rawClass: 'L1',
    typeKey: null,
    classifiedBy: 'none' as const,
    confidence: 'none' as const,
    reasons: [],
  }));
  const result: WorkerResult = {
    contractVersion: TAKEOFF_CONTRACT_VERSION,
    jobId: request.jobId,
    status: 'succeeded',
    startedAtIso: new Date().toISOString(),
    finishedAtIso: new Date().toISOString(),
    sheets: [
      {
        sheetKey: 'p1',
        fileId: request.files[0]?.fileId ?? 'missing',
        name: 'page 1',
        kind: 'pdf_page',
        index: 0,
        widthPx: 1000,
        heightPx: 1000,
        previewArtifact: null,
        scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
        analyzed: 'partial',
        note: 'חלק מהגיליון לא נותח (תקציב זמן)',
        xrefsMissing: [{ name: 'elec_xref.dwg', path: 'xrefs/elec_xref.dwg' }],
        hiddenByLayers: 0,
      },
    ],
    detections,
    legend: [],
    linear: [],
    warnings: [
      {
        code: 'xref_missing',
        severity: 'warning' as const,
        message: 'Missing xref: elec_xref.dwg',
        fileId: request.files[0]?.fileId,
        sheetKey: 'p1',
      },
      ...(request.options.useAi && !process.env.TAKEOFF_AI_BASE_URL
        ? [{ code: 'ai_unavailable', severity: 'warning' as const, message: 'AI provider not configured (TAKEOFF_AI_*)' }]
        : []),
    ],
    errors: [],
    stats: {
      classified_count: 0,
      detection_count: detections.length,
      timing_classify_sec: 0.1,
      timing_extract_sec: 0.2,
    },
    engineVersions: { fake: '1' },
  };
  await applyWorkerResult(db, request.jobId, result);
}

/** HTTP-shaped fake worker used only when dispatch must be async without a real server. */
export function createFakeTakeoffWorkerClient(db: DbExecutor): TakeoffWorkerClient {
  return {
    async dispatch(request) {
      await ingestFakeWorkerResult(db, request);
      return { accepted: true, workerJobId: request.jobId };
    },
    async cancel() {},
    async exportAnnotatedPdf() {
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    },
    async exportBoqPdf() {
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    },
  };
}