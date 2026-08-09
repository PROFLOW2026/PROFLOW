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

export { previewImport, MAX_IMPORT_ROWS } from './application/preview-import';
export type { PreviewImportInput } from './application/preview-import';
export {
  confirmImport,
  confirmImportInBatches,
  BATCH_SIZE,
} from './application/confirm-import';
export type { ConfirmImportInput } from './application/confirm-import';
export {
  permissionForImportKind,
  assertCanImportKind,
  canImportKind,
  listImportableKinds,
  assertCanAccessImports,
} from './application/import-permissions';

export { validateMappedRows, validateMappedValues, rowHasErrors } from './validation/validate-rows';
