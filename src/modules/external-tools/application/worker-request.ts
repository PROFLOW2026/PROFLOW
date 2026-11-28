import {
  TAKEOFF_CONTRACT_VERSION,
  exportAnnotatedPdfRequestSchema,
  exportBoqPdfRequestSchema,
  workerJobRequestSchema,
  type Boq,
  type WorkerJobRequest,
} from '@/modules/electrical-takeoff/domain/contracts';
import { resolveWorkerPairing } from '@/modules/electrical-takeoff/domain/worker-job-pairing';
import type { ToolSession } from '../domain/session-service';

function externalFileKind(name: string): 'pdf' | 'dxf' | 'dwg' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.dxf')) return 'dxf';
  return 'dwg';
}

export function externalWorkerRequest(input: {
  sessionId: string;
  jobId: string;
  origin: string;
  files: readonly { logicalId: string; name: string; size: number; sha256: string | null }[];
  tokens: { source: string; result: string; progress: string; terminal: string };
}): WorkerJobRequest {
  return workerJobRequestSchema.parse({
    contractVersion: TAKEOFF_CONTRACT_VERSION,
    jobId: input.jobId,
    files: input.files.map((file) => ({
      fileId: file.logicalId,
      name: file.name,
      kind: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.dxf') ? 'dxf' : 'dwg',
      sizeBytes: file.size,
      sha256: file.sha256 ?? undefined,
      downloadUrl: `${input.origin}/api/tools/external/worker/file/${input.sessionId}/${file.logicalId}`,
    })),
    options: { resolveXrefByAnchor: true },
    pairing: resolveWorkerPairing(
      input.files.map((file) => ({ id: file.logicalId, name: file.name, kind: externalFileKind(file.name) })),
    ),
    catalog: [],
    callback: {
      progressUrl: `${input.origin}/api/tools/external/worker/progress/${input.sessionId}`,
      resultUrl: `${input.origin}/api/tools/external/worker/result/${input.sessionId}`,
      artifactUrl: `${input.origin}/api/tools/external/worker/result/${input.sessionId}`,
      token: input.tokens.source,
      xrefUrl: `${input.origin}/api/tools/external/worker/xref/${input.sessionId}`,
      heartbeatUrl: `${input.origin}/api/tools/external/worker/progress/${input.sessionId}`,
      terminalUrl: `${input.origin}/api/tools/external/worker/terminal/${input.sessionId}`,
      progressToken: input.tokens.progress,
      terminalToken: input.tokens.terminal,
    },
  });
}

export function externalAnnotatedPdfFromSession(input: {
  session: ToolSession;
  origin: string;
  token: string;
}): Record<string, unknown> | null {
  const pdf = [...input.session.files.values()].find((file) => file.relativePath.toLowerCase().endsWith('.pdf'));
  if (!pdf || !input.session.resultPayload || typeof input.session.resultPayload !== 'object') return null;
  const record = input.session.resultPayload as { sheets?: unknown; detections?: unknown };
  const sheet = (Array.isArray(record.sheets) ? record.sheets : []).find(
    (item) => item && typeof item === 'object' && (item as { fileId?: string }).fileId === pdf.logicalId,
  );
  if (!sheet) return null;
  const detections = (Array.isArray(record.detections) ? record.detections : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (row.fileId !== pdf.logicalId) return [];
    const confidence =
      row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' || row.confidence === 'none'
        ? row.confidence
        : 'none';
    return [{
      id: String(row.id ?? 'mark'),
      x: Number(row.x) || 0,
      y: Number(row.y) || 0,
      w: Number(row.w) || 0,
      h: Number(row.h) || 0,
      typeKey: typeof row.typeKey === 'string' ? row.typeKey : null,
      confidence,
    }];
  });
  const parsed = exportAnnotatedPdfRequestSchema.safeParse({
    contractVersion: TAKEOFF_CONTRACT_VERSION,
    file: {
      fileId: pdf.logicalId,
      name: pdf.relativePath,
      kind: 'pdf',
      sizeBytes: pdf.size,
      sha256: pdf.sha256 ?? undefined,
      downloadUrl: `${input.origin}/api/tools/external/worker/file/${input.session.id}/${pdf.logicalId}`,
    },
    sheet,
    detections,
    styles: [],
    title: pdf.relativePath,
    boqSummary: [],
  });
  void input.token;
  return parsed.success ? parsed.data : null;
}

export function externalBoqPdfRequest(input: { title: string; approved: boolean; boq: Boq }): Record<string, unknown> {
  return exportBoqPdfRequestSchema.parse({
    contractVersion: TAKEOFF_CONTRACT_VERSION,
    title: input.title,
    approved: input.approved,
    generatedAtIso: new Date().toISOString(),
    limitations: input.boq.warnings,
    lines: input.boq.lines.map((line) => ({
      label: line.label,
      category: line.category,
      unit: line.unit,
      quantity: line.quantity,
      floor: line.floor ?? undefined,
      area: line.areaId ?? undefined,
      status: line.verified ? 'verified' : 'draft',
    })),
  });
}
