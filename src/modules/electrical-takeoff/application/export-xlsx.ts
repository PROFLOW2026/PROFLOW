import ExcelJS from 'exceljs';

import { BOQ_XLSX_DRAFT_BANNER } from '../domain/boq-warnings';
import type { Boq, CatalogType, EffectiveDetection, SheetDto } from '../domain/contracts';
import {
  boqQuantityDisplay,
  classifyLegendText,
  isUndeterminedQuantityLine,
  undeterminedQuantityRemarkHe,
} from '../domain/legend-identity';

export type ExportTakeoffXlsxInput = {
  readonly title: string;
  readonly boq: Boq;
  readonly catalog: readonly CatalogType[];
  readonly detections: readonly EffectiveDetection[];
  readonly sheets: readonly SheetDto[];
  readonly approvedAtIso?: string | null;
  readonly approvedBy?: string | null;
};

export async function exportTakeoffBoqXlsx(input: ExportTakeoffXlsxInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectFlow';
  wb.created = new Date();

  const summary = wb.addWorksheet('סיכום כתב כמויות', { views: [{ rightToLeft: true }] });
  const byFloor = wb.addWorksheet('לפי קומה ואזור', { views: [{ rightToLeft: true }] });
  const detail = wb.addWorksheet('פירוט זיהויים', { views: [{ rightToLeft: true }] });
  const limits = wb.addWorksheet('אזהרות ומגבלות', { views: [{ rightToLeft: true }] });

  summary.columns = [
    { header: 'סוג', key: 'label', width: 36 },
    { header: 'קטגוריה', key: 'category', width: 18 },
    { header: 'יחידה', key: 'unit', width: 10 },
    { header: 'כמות', key: 'quantity', width: 18 },
    { header: 'מאומת', key: 'verified', width: 10 },
    { header: 'הערה', key: 'note', width: 56 },
  ];
  const summaryRows = input.boq.lines.filter((l) => !l.excluded);
  for (const line of summaryRows) {
    const undetermined = isUndeterminedQuantityLine(line);
    const kind = line.originalLabel ? classifyLegendText(line.originalLabel) : 'device';
    summary.addRow({
      label: line.label,
      category: line.category,
      unit: line.unit,
      quantity: undetermined ? boqQuantityDisplay(line) : line.quantity,
      verified: line.verified && !undetermined ? 'כן' : 'לא',
      note: undetermined
        ? undeterminedQuantityRemarkHe(kind, line.symbolCount ?? line.detectionIds.length)
        : '',
    });
  }
  summaryRows.forEach((line, index) => {
    if (isUndeterminedQuantityLine(line)) return;
    summary.getRow(index + 2).getCell('quantity').numFmt = '#,##0.##';
  });

  byFloor.columns = [
    { header: 'קומה', key: 'floor', width: 14 },
    { header: 'אזור', key: 'area', width: 16 },
    { header: 'סוג', key: 'label', width: 32 },
    { header: 'כמות', key: 'quantity', width: 18 },
    { header: 'יחידה', key: 'unit', width: 10 },
  ];
  for (const line of input.boq.lines.filter((l) => !l.excluded)) {
    byFloor.addRow({
      floor: line.floor ?? '',
      area: line.areaId ?? '',
      label: line.label,
      quantity: isUndeterminedQuantityLine(line) ? boqQuantityDisplay(line) : line.quantity,
      unit: line.unit,
    });
  }

  const sheetName = new Map(input.sheets.map((s) => [s.sheetKey, s.name]));
  detail.columns = [
    { header: 'מזהה', key: 'id', width: 22 },
    { header: 'גיליון', key: 'sheet', width: 20 },
    { header: 'סוג', key: 'type', width: 28 },
    { header: 'ביטחון', key: 'confidence', width: 12 },
    { header: 'סטטוס', key: 'status', width: 12 },
    { header: 'מקור', key: 'origin', width: 12 },
    { header: 'זיהוי', key: 'identity', width: 16 },
    { header: 'שם מקורי', key: 'original', width: 36 },
    { header: 'X', key: 'x', width: 10 },
    { header: 'Y', key: 'y', width: 10 },
  ];
  const typeName = new Map(input.catalog.map((c) => [c.key, c.nameHe]));
  for (const d of input.detections) {
    const legendName = d.originalText?.trim() || d.legendLabel?.trim();
    detail.addRow({
      id: d.id,
      sheet: sheetName.get(d.sheetKey) ?? d.sheetKey,
      type: legendName || (d.typeKey ? (typeName.get(d.typeKey) ?? d.typeKey) : 'לא מסווג'),
      confidence: d.confidence,
      status: d.status,
      origin: d.origin,
      identity: d.identitySource === 'legend' ? 'מקרא' : d.identitySource === 'library' ? 'ספרייה' : d.identitySource === 'manual' ? 'ידני' : d.identitySource === 'catalog' ? 'קטלוג' : '',
      original: d.originalText ?? '',
      x: d.x,
      y: d.y,
    });
  }

  limits.columns = [
    { header: 'פריט', key: 'item', width: 80 },
  ];
  if (input.boq.state !== 'approved') {
    limits.addRow({ item: BOQ_XLSX_DRAFT_BANNER });
  } else {
    limits.addRow({ item: `מאושר${input.approvedAtIso ? ` — ${input.approvedAtIso}` : ''}${input.approvedBy ? ` (${input.approvedBy})` : ''}` });
  }
  for (const w of input.boq.warnings) {
    limits.addRow({ item: w });
  }
  const review = input.detections.filter((d) => d.needsReview);
  if (review.length > 0) {
    limits.addRow({ item: `פריטים לבדיקה: ${review.length}` });
    for (const d of review.slice(0, 200)) {
      limits.addRow({ item: `${d.id}: ${((d.reasons ?? []).join(', ') || 'needs review')}` });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}