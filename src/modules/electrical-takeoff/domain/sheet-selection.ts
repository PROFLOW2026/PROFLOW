import type { SheetDto, TakeoffEdit, TakeoffFileDto } from './contracts';

export function sheetRefId(fileId: string, sheetKey: string): string {
  return `${fileId}:${sheetKey}`;
}

export function parseSheetRefId(ref: string): { fileId: string; sheetKey: string } {
  const i = ref.indexOf(':');
  if (i <= 0) return { fileId: '', sheetKey: ref };
  return { fileId: ref.slice(0, i), sheetKey: ref.slice(i + 1) };
}

const LEGEND_HINT = /מקרא|legend|מפתח/i;

export function isLikelyLegendSheet(sheet: Pick<SheetDto, 'name' | 'sheetKey' | 'fileId'>, fileName: string): boolean {
  if (sheet.fileId === 'legend') return true;
  const blob = `${fileName} ${sheet.name} ${sheet.sheetKey}`;
  return LEGEND_HINT.test(blob);
}

/** Default inclusion: all non-legend sheets included. */
export function defaultSheetIncluded(sheet: SheetDto, files: readonly TakeoffFileDto[]): boolean {
  const file = files.find((f) => f.id === sheet.fileId);
  if (!file) return true;
  return !isLikelyLegendSheet(sheet, file.name);
}

export function resolveSheetInclusion(
  sheets: readonly SheetDto[],
  files: readonly TakeoffFileDto[],
  edits: readonly TakeoffEdit[],
): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const s of sheets) {
    m.set(sheetRefId(s.fileId, s.sheetKey), defaultSheetIncluded(s, files));
  }
  for (const edit of edits) {
    if (edit.op === 'set_sheet_included') {
      m.set(sheetRefId(edit.fileId, edit.sheetKey), edit.included);
    }
  }
  return m;
}

export type SheetPair = {
  pdfFileId: string;
  pdfSheetKey: string;
  dwgFileId: string;
  dwgSheetKey: string;
};

export function resolveSheetPairings(edits: readonly TakeoffEdit[]): SheetPair[] {
  const pairs: SheetPair[] = [];
  for (const edit of edits) {
    if (edit.op === 'pair_sheets') {
      pairs.push({
        pdfFileId: edit.pdfFileId,
        pdfSheetKey: edit.pdfSheetKey,
        dwgFileId: edit.dwgFileId,
        dwgSheetKey: edit.dwgSheetKey,
      });
    }
    if (edit.op === 'unpair_sheets') {
      const idx = pairs.findIndex(
        (p) =>
          p.pdfFileId === edit.pdfFileId &&
          p.pdfSheetKey === edit.pdfSheetKey &&
          p.dwgFileId === edit.dwgFileId &&
          p.dwgSheetKey === edit.dwgSheetKey,
      );
      if (idx >= 0) pairs.splice(idx, 1);
    }
  }
  return pairs;
}

export function pairedDwgForPdf(
  pairs: readonly SheetPair[],
  pdfFileId: string,
  pdfSheetKey: string,
): SheetPair | undefined {
  return pairs.find((p) => p.pdfFileId === pdfFileId && p.pdfSheetKey === pdfSheetKey);
}

export function pairedPdfForDwg(
  pairs: readonly SheetPair[],
  dwgFileId: string,
  dwgSheetKey: string,
): SheetPair | undefined {
  return pairs.find((p) => p.dwgFileId === dwgFileId && p.dwgSheetKey === dwgSheetKey);
}

/** Hebrew tail / token overlap for PDF↔DWG layout suggestions. */
export function sheetNameSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .normalize('NFKC')
      .replace(/\.(pdf|dwg|dxf)$/i, '')
      .replace(/[_\-/\\]+/g, ' ')
      .trim()
      .toLowerCase();
  const ta = norm(a).split(/\s+/).filter(Boolean);
  const tb = norm(b).split(/\s+/).filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  let score = 0;
  for (const x of ta) {
    if (tb.some((y) => y.includes(x) || x.includes(y))) score += 1;
  }
  const tailA = ta[ta.length - 1]!;
  const tailB = tb[tb.length - 1]!;
  if (tailA === tailB || tailA.includes(tailB) || tailB.includes(tailA)) score += 2;
  return score / Math.max(ta.length, tb.length);
}

export function suggestDwgLayoutsForPdf(
  pdfSheet: SheetDto,
  pdfFileName: string,
  dwgSheets: readonly SheetDto[],
  limit = 3,
): SheetDto[] {
  const ranked = dwgSheets
    .map((s) => ({
      sheet: s,
      score: Math.max(
        sheetNameSimilarity(pdfFileName, s.name),
        sheetNameSimilarity(pdfSheet.name, s.name),
        sheetNameSimilarity(pdfSheet.sheetKey, s.sheetKey),
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((r) => r.sheet);
}