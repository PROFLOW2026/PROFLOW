import 'server-only';

import {
  TAKEOFF_CONTRACT_VERSION,
  type ExportKind,
  exportAnnotatedPdfRequestSchema,
  exportBoqPdfRequestSchema,
} from '../domain/contracts';
import { assertAnalysisAccess, internalActorFrom, takeoffOrgScope, type TakeoffActor } from './access';
import { buildAnalysisView } from './get-analysis-view';
import { exportTakeoffBoqXlsx } from './export-xlsx';
import { takeoffDeps } from '../server';
import { latestSuccessfulJob, listDetectionsForJob, listFilesForAnalysis, listSheetsForJob } from '../data/takeoff.repository';
import type { EffectiveDetection } from '../domain/contracts';
import { sealJobToken } from './worker-token';
import { takeoffNotFound } from '../domain/errors';
import type { OrgContext } from '@/shared/auth/context';

/** Safe Content-Disposition for Hebrew / non-ASCII takeoff export filenames (RFC 5987). */
const LEGEND_PDF = /מקרא|legend|מפתח/i;
const ANNOTATED_DET_CAP = 400;

function isLegendPdfName(name: string): boolean {
  return LEGEND_PDF.test(name);
}

export function resolveAnnotatedExportTarget(
  files: Awaited<ReturnType<typeof listFilesForAnalysis>>,
  rawSheets: Awaited<ReturnType<typeof listSheetsForJob>>,
  jobRequest: Record<string, unknown> | null | undefined,
  detections: readonly EffectiveDetection[],
  detectionFileIdById: ReadonlyMap<string, string>,
): {
  pdf: (typeof files)[number];
  sheet: (typeof rawSheets)[number];
  overlayDetections: EffectiveDetection[];
} | null {
  const pairing = (jobRequest?.pairing as { pdfFileId: string; dwgFileId: string }[] | undefined) ?? [];
  const pairedPdfIds = new Set(pairing.map((p) => p.pdfFileId));
  const pdfs = files.filter((f) => f.kind === 'pdf' && f.uploadState === 'complete');
  const pdf =
    pdfs.find((f) => pairedPdfIds.has(f.id) && !isLegendPdfName(f.name)) ??
    pdfs.find((f) => !isLegendPdfName(f.name)) ??
    pdfs[0];
  if (!pdf) return null;
  const sheet =
    rawSheets.find((s) => s.fileId === pdf.id && s.sheetKey === 'p1') ??
    rawSheets.find((s) => s.fileId === pdf.id) ??
    rawSheets[0];
  if (!sheet) return null;
  const overlayDetections = detections
    .filter(
      (d) =>
        detectionFileIdById.get(d.id) === sheet.fileId &&
        d.sheetKey === sheet.sheetKey &&
        Number.isFinite(d.x) &&
        Number.isFinite(d.y),
    )
    .slice(0, ANNOTATED_DET_CAP);
  return { pdf, sheet, overlayDetections };
}

export function takeoffExportDownloadHeaders(fileName: string, mimeType: string): HeadersInit {
  const asciiFallback = fileName.replace(/[^\w.\-]+/g, '_') || 'takeoff-export.bin';
  const encoded = encodeURIComponent(fileName);
  return {
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'private, no-store',
  };
}

export async function buildExportBytes(
  actor: TakeoffActor,
  analysisId: string,
  kind: ExportKind,
): Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }> {
  await assertAnalysisAccess(actor, analysisId, 'view');
  const view = await buildAnalysisView(actor, analysisId);
  const { db, organizationId } = takeoffOrgScope(actor);
  if (kind === 'xlsx') {
    const buffer = await exportTakeoffBoqXlsx({
      title: view.summary.name,
      boq: view.boq,
      catalog: view.catalog,
      detections: view.detections,
      sheets: view.sheets,
      approvedAtIso: view.summary.approvedAtIso,
    });
    return { bytes: new Uint8Array(buffer), fileName: `${view.summary.name}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  const job = await latestSuccessfulJob(db, organizationId, analysisId);
  if (!job) takeoffNotFound();
  const files = await listFilesForAnalysis(db, organizationId, analysisId);

  const secret = process.env.TAKEOFF_WORKER_SECRET;
  if (!secret) throw new Error('worker secret missing');
  const token = sealJobToken(job.id, secret, 1000 * 60 * 15, Date.now());
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000';

  if (kind === 'annotated-pdf') {
    const rawSheets = await listSheetsForJob(db, organizationId, job.id);
    const jobRequest =
      job.requestJson && typeof job.requestJson === 'object' ? (job.requestJson as Record<string, unknown>) : null;
    const baseDetections = await listDetectionsForJob(db, organizationId, job.id);
    const detectionFileIdById = new Map(baseDetections.map((d) => [d.id, d.fileId]));
    const target = resolveAnnotatedExportTarget(files, rawSheets, jobRequest, view.detections, detectionFileIdById);
    if (!target) takeoffNotFound();
    const { pdf, sheet, overlayDetections } = target;
    const body = exportAnnotatedPdfRequestSchema.parse({
      contractVersion: TAKEOFF_CONTRACT_VERSION,
      file: {
        fileId: pdf.id,
        name: pdf.name,
        kind: pdf.kind,
        sizeBytes: pdf.sizeBytes,
        downloadUrl: `${origin}/api/takeoff/worker/file/${job.id}/${pdf.id}`,
      },
      sheet,
      detections: overlayDetections.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
        typeKey: d.typeKey,
        confidence: d.confidence,
      })),
      styles: view.catalog.map((t) => ({
        typeKey: t.key,
        label: t.nameHe,
        colorHex: t.colorHex,
      })),
      title: view.summary.name,
      boqSummary: view.boq.lines.slice(0, 20).map((l) => ({ label: l.label, quantity: l.quantity, unit: l.unit })),
    });
    const bytes = await takeoffDeps.worker.exportAnnotatedPdf({ ...body, jobBearer: token.bearer });
    return { bytes, fileName: `${view.summary.name}-annotated.pdf`, mimeType: 'application/pdf' };
  }

  const boqBody = exportBoqPdfRequestSchema.parse({
    contractVersion: TAKEOFF_CONTRACT_VERSION,
    title: view.summary.name,
    approved: view.summary.status === 'approved',
    generatedAtIso: new Date().toISOString(),
    limitations: view.boq.warnings,
    lines: view.boq.lines.map((l) => ({
      label: l.label,
      category: l.category,
      unit: l.unit,
      quantity: l.quantity,
      floor: l.floor ?? undefined,
      area: l.areaId ?? undefined,
      status: l.verified ? 'verified' : 'draft',
    })),
  });
  const bytes = await takeoffDeps.worker.exportBoqPdf(boqBody);
  return { bytes, fileName: `${view.summary.name}-boq.pdf`, mimeType: 'application/pdf' };
}

/** @deprecated prefer `buildExportBytes(actor, …)` */
export async function buildExportBytesForOrgContext(context: OrgContext, analysisId: string, kind: ExportKind) {
  return buildExportBytes(internalActorFrom(context), analysisId, kind);
}