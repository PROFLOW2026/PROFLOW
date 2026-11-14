import type { SheetDto } from '../domain/contracts';

export function sheetRefId(sheet: Pick<SheetDto, 'fileId' | 'sheetKey'>): string {
  return `${sheet.fileId}:${sheet.sheetKey}`;
}

export function parseSheetRefId(id: string): { fileId: string; sheetKey: string } {
  const i = id.indexOf(':');
  if (i <= 0) return { fileId: '', sheetKey: id };
  const fileId = id.slice(0, i);
  const sheetKey = id.slice(i + 1);
  return { fileId, sheetKey };
}

/** Worker detection ids are prefixed with sheetKey (may contain colons for DWG layouts). */
export function detectionMatchesSheet(
  detectionId: string,
  sheet: Pick<SheetDto, 'fileId' | 'sheetKey'>,
): boolean {
  if (detectionId.startsWith(`${sheet.sheetKey}#`)) return sheet.fileId === 'lightg' || sheet.fileId === 'legend';
  if (sheet.fileId === 'dwg' && detectionId.startsWith(`${sheet.sheetKey}#`)) return true;
  if (sheet.fileId === 'lightg' && sheet.sheetKey === 'p1') {
    return detectionId.startsWith('p1#');
  }
  return false;
}

export function detectionsForSheet<T extends { id: string; sheetKey: string }>(
  detections: readonly T[],
  sheet: Pick<SheetDto, 'fileId' | 'sheetKey'>,
): T[] {
  if (sheet.fileId === 'legend') {
    return [];
  }
  if (sheet.fileId === 'lightg' && sheet.sheetKey === 'p1') {
    return detections.filter((d) => d.sheetKey === 'p1' && d.id.startsWith('p1#'));
  }
  if (sheet.fileId === 'dwg') {
    return detections.filter((d) => d.sheetKey === sheet.sheetKey);
  }
  return detections.filter((d) => d.sheetKey === sheet.sheetKey);
}