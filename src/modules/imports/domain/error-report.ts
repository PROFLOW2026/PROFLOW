import type { ImportConfirmResult, ImportPreview } from './types';
import { rowsToCsv } from '@/modules/exports/domain/csv';

/** Build a downloadable CSV of preview row issues (errors + warnings). */
export function buildImportIssuesReportCsv(preview: ImportPreview): string {
  const valueKeys =
    preview.rows[0] !== undefined ? Object.keys(preview.rows[0].values) : ([] as string[]);
  const headers = ['row_number', 'severity', 'field', 'message', ...valueKeys];
  const rows = preview.rows.flatMap((row) =>
    row.issues.map((issue) => [
      String(row.rowNumber),
      issue.severity,
      issue.field ?? '',
      issue.message,
      ...valueKeys.map((key) => row.values[key] ?? ''),
    ]),
  );
  return rowsToCsv(headers, rows);
}

export function buildImportConfirmFailuresCsv(result: ImportConfirmResult): string {
  const headers = ['row_number', 'ok', 'entity_id', 'error'];
  const rows = result.results
    .filter((r) => !r.ok)
    .map((r) => [String(r.rowNumber), 'false', r.entityId ?? '', r.error ?? '']);
  return rowsToCsv(headers, rows);
}
