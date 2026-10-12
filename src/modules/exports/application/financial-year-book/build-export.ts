import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ExportResult } from '../build-csv-export';
import { xlsxDownloadHeadersUtf8 } from '../../domain/xlsx';
import {
  buildFinancialYearBookWorkbook,
  financialYearBookFileName,
} from './build-workbook';
import { loadFinancialYearBookData } from '@/modules/financials/application/load-financial-year-book-data';

function parseExportYear(raw: string | null | undefined): number {
  if (!raw || !/^\d{4}$/.test(raw)) {
    throw new ValidationError([{ path: 'year', message: 'year must be YYYY' }]);
  }
  const year = Number(raw);
  if (year < 2000 || year > 2100) {
    throw new ValidationError([{ path: 'year', message: 'year out of supported range' }]);
  }
  return year;
}

export async function buildFinancialYearBookExport(
  context: OrgContext,
  options: { readonly year?: string | null },
): Promise<ExportResult> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const year = parseExportYear(options.year);
  const data = await loadFinancialYearBookData(context, year);
  const body = await buildFinancialYearBookWorkbook(data);
  return {
    body: new Uint8Array(body),
    headers: xlsxDownloadHeadersUtf8(financialYearBookFileName(year)),
  };
}
