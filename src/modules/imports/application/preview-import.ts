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
  flagBoqItemCodeDuplicates,
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
import { assertCanImportKind, canImportEmployeeCostFields } from './import-permissions';

/** Default row cap for most import kinds. */
export const MAX_IMPORT_ROWS = 500;
/** Large BOQ CSVs need a higher ceiling (chapters + items). */
export const MAX_IMPORT_ROWS_BOQ = 2000;

export function maxImportRowsForKind(kind: ImportKind): number {
  return kind === 'boq_items' ? MAX_IMPORT_ROWS_BOQ : MAX_IMPORT_ROWS;
}

export interface PreviewImportInput {
  readonly kind: string;
  readonly csvText: string;
  /** Optional override; when omitted, headers are auto-mapped. */
  readonly mapping?: ColumnMapping;
  /** Required for boq_items confirm; optional at preview (validated on confirm). */
  readonly projectId?: string;
  readonly boqId?: string;
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

  if (parsed.rows.length > maxImportRowsForKind(kind)) {
    const max = maxImportRowsForKind(kind);
    throw new ValidationError([
      {
        path: 'csv',
        message: `Too many rows (max ${max})`,
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
    locale: context.locale,
    canManageWorkforceCost: canImportEmployeeCostFields(context),
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
  if (kind === 'boq_items') {
    rows = flagBoqItemCodeDuplicates(rows, context.locale);
  }
  if (kind === 'inventory') {
    rows = flagInFileDuplicates(rows, 'sku', 'SKU');
    rows = flagInFileDuplicates(rows, 'barcode', 'barcode');
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

  if (kind === 'inventory') {
    const moneyHeaders = parsed.headers.filter((header) =>
      /amount|cost|price|fifo|actual|expense|עלות|מחיר/i.test(header),
    );
    if (moneyHeaders.length > 0) {
      const warning = {
        severity: 'warning' as const,
        message: `Cost/price columns ignored (${moneyHeaders.join(', ')}); inventory import is quantity only — not Actual`,
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
