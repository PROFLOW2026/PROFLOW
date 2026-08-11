import type { MappedImportRow } from './types';

export function rowHasErrors(row: MappedImportRow): boolean {
  return row.issues.some((issue) => issue.severity === 'error');
}
