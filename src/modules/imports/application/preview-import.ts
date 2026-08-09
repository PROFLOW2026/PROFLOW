import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { parseCsv, CsvParseError } from '../domain/csv-parse';
import {
  applyMapping,
  autoMapColumns,
  sanitizeMapping,
} from '../domain/column-mapping';
import {
  detectWithinFileDuplicates,
  flagExpenseInFileDuplicates,
  flagInFileDuplicates,
  mergeIssueMaps,
} from '../domain/duplicates';
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
 * Call `enrichImportPreview` afterward for tenant refs / org duplicate names.
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

  let rows: MappedImportRow[] = validateMappedRows(kind, mapped, {
    baseCurrency: context.organization.baseCurrency,
  });

  if (kind === 'projects') {
    rows = flagInFileDuplicates(rows, 'name', 'project');
  }
  if (kind === 'clients' || kind === 'vendors' || kind === 'employees') {
    rows = mergeIssueMaps(rows, detectWithinFileDuplicates(kind, rows));
  }
  if (kind === 'expenses') {
    rows = flagExpenseInFileDuplicates(rows);
  }

  if (kind === 'projects') {
    const financialHeaders = parsed.headers.filter((header) =>
      /contract|amount|invoice|paid|outstanding|gross|tax|vat|revenue|billing/i.test(header),
    );
    if (financialHeaders.length > 0) {
      const warning = {
        severity: 'warning' as const,
        message: `Financial columns ignored (${financialHeaders.join(', ')}); contract amounts are not imported`,
      };
      rows = rows.map((row) => ({
        ...row,
        issues: [...row.issues, warning],
      }));
    }
  }

  if (kind === 'expenses') {
    const taxHeaders = parsed.headers.filter((header) =>
      /tax|vat|מע["״']?מ|net_amount|net amount/i.test(header),
    );
    if (taxHeaders.length > 0) {
      const warning = {
        severity: 'warning' as const,
        message: `Tax/VAT columns ignored (${taxHeaders.join(', ')}); VAT is not profit and is not imported`,
      };
      rows = rows.map((row) => ({
        ...row,
        issues: [...row.issues, warning],
      }));
    }
  }

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
