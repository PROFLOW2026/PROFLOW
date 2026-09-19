import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { isSumitExpenseIngestionEnabled } from '../domain/settings';
import { getOrgExpenseIngestionSettings } from '../data/settings.repository';
import {
  listImportsForOrg,
  upsertDetectedImport,
} from '../data/imports.repository';
import { queueSumitImportOcr } from './queue-import-ocr';
import { resolveSumitHttpClientForOrg } from './resolve-sumit-client';
import { syncAllImportStatusesForOrg } from './sync-import-status';

export interface PollSumitExpensesResult {
  readonly detected: number;
  readonly queued: number;
  readonly skipped: number;
  readonly errors: number;
}

function recentWindowIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Detect new SUMIT expense documents and queue OCR for pending imports.
 * Bounded to recent date window — no full historical rescan.
 */
export async function pollSumitExpensesForOrg(
  context: OrgContext,
): Promise<PollSumitExpensesResult> {
  const settings = await getOrgExpenseIngestionSettings(context);
  if (!isSumitExpenseIngestionEnabled(settings)) {
    return { detected: 0, queued: 0, skipped: 0, errors: 0 };
  }

  const client = await resolveSumitHttpClientForOrg(context);
  if (!client) {
    return { detected: 0, queued: 0, skipped: 1, errors: 0 };
  }

  let detected = 0;
  let queued = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const docs = await client.listExpenseDocuments({
      dateFrom: `${recentWindowIso(90)}T00:00:00`,
      dateTo: `${new Date().toISOString().slice(0, 10)}T23:59:59`,
      includeDrafts: true,
      pageSize: 100,
    });
    for (const doc of docs) {
      const before = await listImportsForOrg(context.db, context.organizationId);
      const had = before.some((row) => row.externalDocumentId === doc.documentId);
      await upsertDetectedImport(context.db, {
        organizationId: context.organizationId,
        externalDocumentId: doc.documentId,
        sourceDocumentType: doc.documentType,
      });
      if (!had) detected += 1;
    }
  } catch {
    errors += 1;
  }

  await syncAllImportStatusesForOrg(context);

  const pending = await listImportsForOrg(context.db, context.organizationId, {
    statuses: ['detected', 'failed'],
  });

  for (const imp of pending) {
    if (imp.status === 'failed' && imp.ocrJobId) {
      skipped += 1;
      continue;
    }
    try {
      const result = await queueSumitImportOcr(context, imp);
      if (result.status === 'ocr_queued' || result.status === 'needs_review') queued += 1;
      else skipped += 1;
    } catch {
      errors += 1;
    }
  }

  await syncAllImportStatusesForOrg(context);
  return { detected, queued, skipped, errors };
}
