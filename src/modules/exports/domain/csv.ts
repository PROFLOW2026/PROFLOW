/**
 * RFC4180-ish CSV helpers for permission-gated exports.
 * Values are stringified; decimals stay as decimal strings (never floats).
 */

export type CsvCell = string | number | boolean | Date | null | undefined;

export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

export function rowsToCsv(headers: readonly string[], rows: readonly CsvCell[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  // BOM helps Excel open UTF-8 (Hebrew) correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvDownloadHeaders(fileName: string): HeadersInit {
  const safe = fileName.replace(/[^\w.\-]+/g, '_');
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${safe}"`,
    'Cache-Control': 'no-store',
  };
}
