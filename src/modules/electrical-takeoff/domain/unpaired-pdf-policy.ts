import type { EffectiveDetection, SheetDto, TakeoffReviewReason, WorkerDetection } from './contracts';

/** Legend / מקרא PDF sheets are never plan quantities (rows live in legend table). */
export function isLegendPdfSheet(sheet: SheetDto): boolean {
  if (sheet.kind !== 'pdf_page') return false;
  if (sheet.fileId === 'legend') return true;
  return /מקרא|legend/i.test(sheet.name);
}

export function analysisHasDwgSheets(sheets: readonly SheetDto[]): boolean {
  return sheets.some((s) => s.kind === 'dwg_layout' || s.kind === 'dwg_model');
}

/**
 * When the job includes DWG but PDF plan sheets were not merged (no pairing / no twin),
 * PDF plan symbols must not stack on top of DWG in BOQ — tag `pdf_only` (review until confirm).
 */
/** True when at least one twin group contains both PDF and DWG (successful merge). */
const MERGE_PAIRS_TRUST = 20;

export function inferPdfDwgMerged(
  workerDetections: readonly Pick<WorkerDetection, 'id' | 'source' | 'twinId'>[],
  twinIdByDetectionId: ReadonlyMap<string, string | undefined>,
  mergeMatchedPairs?: number,
): boolean {
  if (mergeMatchedPairs != null) {
    return mergeMatchedPairs >= MERGE_PAIRS_TRUST;
  }
  const byTwin = new Map<string, Set<WorkerDetection['source']>>();
  for (const d of workerDetections) {
    const twin = twinIdByDetectionId.get(d.id) ?? d.twinId;
    if (!twin) continue;
    const set = byTwin.get(twin) ?? new Set();
    set.add(d.source);
    byTwin.set(twin, set);
  }
  let crossPairs = 0;
  for (const sources of byTwin.values()) {
    if (sources.has('pdf') && sources.has('dwg')) crossPairs += 1;
  }
  return crossPairs >= MERGE_PAIRS_TRUST;
}

export function applyUnpairedPdfPolicy(
  detections: readonly EffectiveDetection[],
  sheets: readonly SheetDto[],
  twinIdByDetectionId: ReadonlyMap<string, string | undefined>,
  workerDetections?: readonly Pick<WorkerDetection, 'id' | 'source' | 'twinId'>[],
  detectionFileIdById?: ReadonlyMap<string, string>,
  mergeMatchedPairs?: number,
): { detections: EffectiveDetection[]; unpairedPdfTagged: number } {
  if (!analysisHasDwgSheets(sheets)) {
    return { detections: [...detections], unpairedPdfTagged: 0 };
  }

  const paired = workerDetections?.length
    ? inferPdfDwgMerged(workerDetections, twinIdByDetectionId, mergeMatchedPairs)
    : false;
  if (paired) {
    return { detections: [...detections], unpairedPdfTagged: 0 };
  }

  const sheetByRef = new Map(sheets.map((s) => [`${s.fileId}:${s.sheetKey}`, s]));
  const legendFileIds = new Set(sheets.filter((s) => isLegendPdfSheet(s)).map((s) => s.fileId));

  let unpairedPdfTagged = 0;
  const out = detections.map((d) => {
    if (d.source !== 'pdf') return d;
    if (d.reasons.includes('legend_zone')) return d;
    const fileId = detectionFileIdById?.get(d.id);
    const sheet =
      (fileId ? sheetByRef.get(`${fileId}:${d.sheetKey}`) : undefined) ??
      [...sheets].find((s) => s.sheetKey === d.sheetKey && s.kind === 'pdf_page');
    if (!sheet || sheet.kind !== 'pdf_page') return d;
    if (legendFileIds.has(sheet.fileId)) return d;
    if (d.reasons.includes('pdf_only')) return d;

    unpairedPdfTagged += 1;
    const reasons = [...d.reasons, 'pdf_only'] as TakeoffReviewReason[];
    return { ...d, reasons };
  });

  return { detections: out, unpairedPdfTagged };
}