/**
 * RFC4180-ish CSV parser for structured imports (doc 37).
 * Complements export helpers in `modules/exports` — parse side only.
 */

import type { ParsedCsv } from './types';

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/** Strip UTF-8 BOM if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parse a full CSV document into headers + data rows.
 * Empty trailing lines are ignored. Quoted fields may contain commas/newlines.
 */
export function parseCsv(text: string): ParsedCsv {
  const source = stripBom(text);
  if (!source.trim()) {
    throw new CsvParseError('CSV is empty');
  }

  const matrix = parseCsvMatrix(source);
  if (matrix.length === 0) {
    throw new CsvParseError('CSV is empty');
  }

  const headers = matrix[0]!.map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h === '')) {
    throw new CsvParseError('CSV header row is empty');
  }

  const rows = matrix.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));
  const width = headers.length;
  const normalized = rows.map((row) => {
    const cells = [...row];
    while (cells.length < width) cells.push('');
    return cells.slice(0, width).map((cell) => cell.trim()) as readonly string[];
  });

  return { headers, rows: normalized };
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      pushCell();
      i += 1;
      continue;
    }

    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }

    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new CsvParseError('Unterminated quoted field');
  }

  // Final row (file may omit trailing newline).
  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}
