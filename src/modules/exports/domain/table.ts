import type { CsvCell } from './csv';

/** Tabular export payload shared by CSV and XLSX writers. */
export interface ExportTable {
  readonly sheetName: string;
  readonly headers: readonly string[];
  readonly rows: readonly CsvCell[][];
  /** Optional disclosure / currency note (not mixed into numeric totals). */
  readonly notes?: readonly string[];
}
