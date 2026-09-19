import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import type { OcrFieldCandidate } from '@/modules/ocr/domain/types';
import { getOcrRepository } from '@/modules/ocr/data/resolve-repository';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listImportsForOrg } from '../data/imports.repository';
import type { ExternalExpenseImport, ExternalExpenseImportStatus } from '../domain/types';

function fieldValue(field: OcrFieldCandidate | null | undefined): string | null {
  const value = field?.value?.trim();
  return value && value.length > 0 ? value : null;
}

export interface ReceivedExpenseImportRow {
  readonly import: ExternalExpenseImport;
  readonly sourceLabel: 'sumit' | 'manual' | 'camera';
  readonly supplier: string | null;
  readonly reference: string | null;
  readonly date: string | null;
  readonly net: string | null;
  readonly vat: string | null;
  readonly gross: string | null;
  readonly matchedVendorName: string | null;
  readonly ocrStatus: string | null;
  readonly canReview: boolean;
}

export async function listReceivedExpenseImports(
  context: OrgContext,
  options: { statuses?: readonly ExternalExpenseImportStatus[] } = {},
): Promise<ReceivedExpenseImportRow[]> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  const imports = await listImportsForOrg(context.db, context.organizationId, {
    statuses: options.statuses,
  });
  const repo = getOcrRepository(context.db);
  const rows: ReceivedExpenseImportRow[] = [];

  for (const imp of imports) {
    if (imp.status === 'ignored') continue;

    let supplier: string | null = null;
    let reference: string | null = null;
    let date: string | null = null;
    let net: string | null = null;
    let vat: string | null = null;
    let gross: string | null = null;
    let matchedVendorName: string | null = null;
    let ocrStatus: string | null = null;
    let canReview = false;

    if (imp.ocrJobId) {
      const job = await repo.findJob(context.organizationId, imp.ocrJobId);
      if (job) {
        ocrStatus = job.status;
        canReview =
          job.status === 'needs_review' ||
          job.status === 'succeeded' ||
          job.status === 'failed';
        const candidates = job.candidates ?? job.extractedCandidates;
        if (candidates) {
          supplier = fieldValue(candidates.vendor);
          reference = fieldValue(candidates.reference);
          date = fieldValue(candidates.date);
          net = fieldValue(candidates.net);
          vat = fieldValue(candidates.tax);
          gross = fieldValue(candidates.gross);
        }
        const topMatch = job.rawMetadata?.vendorMatches?.[0];
        matchedVendorName = topMatch?.vendorName ?? null;
      }
    }

    rows.push({
      import: imp,
      sourceLabel: 'sumit',
      supplier,
      reference,
      date,
      net,
      vat,
      gross,
      matchedVendorName,
      ocrStatus,
      canReview,
    });
  }

  return rows;
}
