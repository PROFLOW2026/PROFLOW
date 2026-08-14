/** Public API of the imports module (doc 37). */
export {
  IMPORT_KINDS,
  ENABLED_IMPORT_KINDS,
  isImportKind,
  isEnabledImportKind,
} from './domain/types';
export type {
  ImportKind,
  EnabledImportKind,
  ImportIssue,
  ImportPreview,
  ImportConfirmResult,
  ImportRowResult,
  MappedImportRow,
  ColumnMapping,
  ParsedCsv,
  ImportFieldDef,
} from './domain/types';

export { parseCsv, stripBom, CsvParseError } from './domain/csv-parse';
export {
  autoMapColumns,
  applyMapping,
  sanitizeMapping,
  normalizeHeader,
} from './domain/column-mapping';
export { fieldDefsForKind, requiredFieldKeys } from './domain/field-defs';
export {
  buildImportTemplateCsv,
  importTemplateFileName,
  importTemplateHeaders,
  importTemplateExampleRows,
} from './domain/templates';
export {
  buildImportIssuesReportCsv,
  buildImportConfirmFailuresCsv,
} from './domain/error-report';
export {
  flagInFileDuplicates,
  flagExpenseInFileDuplicates,
  flagBoqItemCodeDuplicates,
  flagExistingNameDuplicates,
  detectWithinFileDuplicates,
  detectExistingDuplicates,
  emptyExistingIndex,
  mergeIssueMaps,
} from './domain/duplicates';
export type { ExistingImportIndex } from './domain/duplicates';
export {
  parseImportDecimal,
  isBlankOrTotalBoqRow,
  isBoqImportSkipRow,
} from './domain/boq-import-parse';

export {
  previewImport,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_ROWS_BOQ,
  maxImportRowsForKind,
} from './application/preview-import';
export type { PreviewImportInput } from './application/preview-import';
export { enrichImportPreview } from './application/enrich-preview';
export {
  confirmImport,
  confirmImportInBatches,
  BATCH_SIZE,
} from './application/confirm-import';
export type { ConfirmImportInput } from './application/confirm-import';
export { confirmBoqItemsRows } from './application/confirm-boq-import';
export {
  permissionForImportKind,
  assertCanImportKind,
  canImportKind,
  canImportEmployeeCostFields,
  employeeImportBaseRate,
  listImportableKinds,
  assertCanAccessImports,
} from './application/import-permissions';

export {
  validateMappedRows,
  validateMappedValues,
  validateBoqItems,
  rowHasErrors,
} from './validation/validate-rows';
