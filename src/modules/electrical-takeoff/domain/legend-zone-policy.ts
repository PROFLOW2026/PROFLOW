import type { EffectiveDetection, SheetDto, TakeoffFileDto, WorkerLegendEntry } from './contracts';
import { isLikelyLegendSheet } from './sheet-selection';

type LegendRow = Pick<WorkerLegendEntry, 'key' | 'signature' | 'sheetKey' | 'textBox'>;
type ZoneSheet = Pick<SheetDto, 'sheetKey' | 'name' | 'fileId'>;
type ZoneFile = Pick<TakeoffFileDto, 'id' | 'name'>;

function signatureKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function legendSheetKeys(sheets: readonly ZoneSheet[], files: readonly ZoneFile[]): Set<string> {
  const keys = new Set<string>();
  for (const sheet of sheets) {
    const fileName = files.find((file) => file.id === sheet.fileId)?.name ?? '';
    if (isLikelyLegendSheet(sheet, fileName)) keys.add(sheet.sheetKey);
  }
  return keys;
}

function centerInsideBox(
  x: number,
  y: number,
  box: NonNullable<LegendRow['textBox']>,
  pad: number,
): boolean {
  return x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad;
}

function detectionMatchesLegendTextBox(
  detection: EffectiveDetection,
  rows: readonly LegendRow[],
): boolean {
  const sig = signatureKey(detection.signature);
  const native = detection.native;
  for (const row of rows) {
    const box = row.textBox;
    if (!box) continue;
    if (row.sheetKey && row.sheetKey !== detection.sheetKey && row.sheetKey !== 'model') continue;
    if (sig && signatureKey(row.signature) && signatureKey(row.signature) !== sig) continue;
    const width = Math.abs(box.x1 - box.x0);
    const height = Math.abs(box.y1 - box.y0);
    const pad = Math.max(width, height, 24) * 3;
    if (native && centerInsideBox(native.x, native.y, box, pad)) return true;
    if (centerInsideBox(detection.x, detection.y, box, pad)) return true;
  }
  return false;
}

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? fallback;
}

function clusterAlongAxis(
  marks: readonly EffectiveDetection[],
  along: 'x' | 'y',
  gap: number,
): EffectiveDetection[][] {
  const ordered = [...marks].sort((a, b) => a[along] - b[along] || a.id.localeCompare(b.id, 'en'));
  const clusters: EffectiveDetection[][] = [];
  for (const mark of ordered) {
    const current = clusters[clusters.length - 1];
    if (!current || mark[along] - current[current.length - 1]![along] > gap) {
      clusters.push([mark]);
    } else {
      current.push(mark);
    }
  }
  return clusters;
}

function isLegendTableCluster(cluster: readonly EffectiveDetection[], medianSize: number): boolean {
  if (cluster.length < 3) return false;
  const signatures = cluster.map((mark) => signatureKey(mark.signature)).filter(Boolean);
  const unique = new Set(signatures);
  if (unique.size < 3) return false;
  if (unique.size / cluster.length < 0.5) return false;
  const xs = cluster.map((mark) => mark.x);
  const ys = cluster.map((mark) => mark.y);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  const longSpan = Math.max(xSpan, ySpan);
  const crossSpan = Math.min(xSpan, ySpan);
  if (longSpan < crossSpan * 1.2 && unique.size < 4) return false;
  const along = ySpan >= xSpan ? 'y' : 'x';
  const ordered = [...cluster].sort((a, b) => a[along] - b[along]);
  const gaps = ordered
    .slice(1)
    .map((mark, index) => mark[along] - ordered[index]![along])
    .filter((value) => value > 0.5);
  const pitch = median(gaps, medianSize * 2);
  return pitch <= Math.max(medianSize * 12, 80);
}

function legendTableMemberIds(
  detections: readonly EffectiveDetection[],
  legendSignatures: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  const bySheet = new Map<string, EffectiveDetection[]>();
  for (const detection of detections) {
    const sig = signatureKey(detection.signature);
    const linked = (detection.legendRowIds ?? []).length > 0;
    if (!sig && !linked) continue;
    if (sig && !legendSignatures.has(sig) && !linked) continue;
    const list = bySheet.get(detection.sheetKey) ?? [];
    list.push(detection);
    bySheet.set(detection.sheetKey, list);
  }
  for (const marks of bySheet.values()) {
    const medianSize = median(
      marks.flatMap((mark) => [mark.w, mark.h]).filter((value) => value > 0),
      12,
    );
    const gap = Math.max(medianSize * 4, 24);
    for (const cluster of [...clusterAlongAxis(marks, 'x', gap), ...clusterAlongAxis(marks, 'y', gap)]) {
      if (!isLegendTableCluster(cluster, medianSize)) continue;
      for (const mark of cluster) ids.add(mark.id);
    }
  }
  return ids;
}

/**
 * Marks that belong to a legend table or a dedicated legend sheet.
 * Plan copies of the same accessory are left alone. Confirmed marks stay as stored.
 */
export function applyLegendZonePolicy(
  detections: readonly EffectiveDetection[],
  input: {
    legend?: readonly LegendRow[];
    sheets?: readonly ZoneSheet[];
    files?: readonly ZoneFile[];
  },
): EffectiveDetection[] {
  const legend = input.legend ?? [];
  const sheets = input.sheets ?? [];
  const files = input.files ?? [];
  if (detections.length === 0) return [...detections];

  const legendSheets = legendSheetKeys(sheets, files);
  const legendSignatures = new Set(
    legend.map((row) => signatureKey(row.signature)).filter(Boolean),
  );
  const tableIds = legendTableMemberIds(detections, legendSignatures);

  return detections.map((detection) => {
    if (detection.status === 'confirmed') return detection;
    if (detection.reasons.includes('legend_zone') || detection.reasons.includes('drawing_noise')) {
      return detection;
    }
    const onLegendSheet = legendSheets.has(detection.sheetKey);
    const inStoredBox = detectionMatchesLegendTextBox(detection, legend);
    const inLegendTable = tableIds.has(detection.id);
    if (!onLegendSheet && !inStoredBox && !inLegendTable) return detection;
    return {
      ...detection,
      reasons: [...detection.reasons, 'legend_zone'],
    };
  });
}

export function firstPlanOccurrenceId(
  detections: readonly EffectiveDetection[],
  predicate: (detection: EffectiveDetection) => boolean,
): string | undefined {
  const matches = detections.filter(predicate);
  return (
    matches.find((detection) => !detection.reasons.includes('legend_zone'))?.id ?? matches[0]?.id
  );
}
