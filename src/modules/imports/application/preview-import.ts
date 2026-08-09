import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { parseCsv, CsvParseError } from '../domain/csv-parse';
import {
  applyMapping,
  autoMapColumns,
  sanitizeMapping,
} from '../domain/column-mapping';
import {
  isEnabledImportKind,
  isImportKind,
  type ColumnMapping,
  type ImportKind,
  type ImportPreview,
  type MappedImportRow,
} from '../domain/types';
import { validateMappedRows, rowHasErrors } from '../validation/validate-rows';
import { assertCanImportKind } from './import-permissions';

const MAX_IMPORT_ROWS = 500;

export interface PreviewImportInput {
  readonly kind: string;
  readonly csvText: string;
  /** Optional override; when omitted, headers are auto-mapped. */
  readonly mapping?: ColumnMapping;
}

/**
 * Parse CSV → map columns → validate rows (session/in-memory; no DB writes).
 */
export function previewImport(
  context: OrgContext,
  input: PreviewImportInput,
): ImportPreview {
  if (!isImportKind(input.kind)) {
    throw new ValidationError([{ path: 'kind', message: 'Unknown import kind' }]);
  }

  const kind: ImportKind = input.kind;
  assertCanImportKind(context, kind);

  if (!isEnabledImportKind(kind)) {
    return {
      kind,
      headers: [],
      mapping: {},
      rows: [],
      validCount: 0,
      errorCount: 0,
      warningCount: 0,
      enabled: false,
    };
  }

  let parsed;
  try {
    parsed = parseCsv(input.csvText);
  } catch (error) {
    if (error instanceof CsvParseError) {
      throw new ValidationError([{ path: 'csv', message: error.message }]);
    }
    throw error;
  }

  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError([
      {
        path: 'csv',
        message: `Too many rows (max ${MAX_IMPORT_ROWS})`,
      },
    ]);
  }

  const mapping = sanitizeMapping(
    kind,
    parsed.headers,
    input.mapping ?? autoMapColumns(kind, parsed.headers),
  );

  const mapped = parsed.rows.map((row, index) => ({
    rowNumber: index + 2, // 1-based file line; header is line 1
    values: applyMapping(parsed.headers, row, mapping),
  }));

  const rows: MappedImportRow[] = validateMappedRows(kind, mapped);
  const errorCount = rows.filter(rowHasErrors).length;
  const warningCount = rows.filter((r) => r.issues.some((i) => i.severity === 'warning')).length;
  const validCount = rows.length - errorCount;

  return {
    kind,
    headers: parsed.headers,
    mapping,
    rows,
    validCount,
    errorCount,
    warningCount,
    enabled: true,
  };
}

export { MAX_IMPORT_ROWS };
