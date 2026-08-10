import { workbookFirstSheetToMatrix } from '@/modules/exports/domain/xlsx';
import type { OrgContext } from '@/shared/auth/context';
import { matrixToCsvText } from '../domain/parse-statement';
import {
  importBankStatement,
  type ImportBankStatementResult,
} from './import-statement';

/**
 * First-class XLSX/XLS import: first sheet → CSV-shaped pipeline.
 * Does not invent live bank feed connectivity.
 */
export async function importBankStatementXlsx(
  context: OrgContext,
  input: {
    bankAccountId: string;
    data: Buffer | ArrayBuffer | Uint8Array;
    fileName?: string | null;
  },
): Promise<ImportBankStatementResult> {
  const { headers, rows } = await workbookFirstSheetToMatrix(input.data);
  const csvText = matrixToCsvText(headers, rows);
  return importBankStatement(context, {
    bankAccountId: input.bankAccountId,
    csvText,
    fileName: input.fileName ?? null,
    source: 'xlsx_import',
  });
}
