import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import type { ExtractionJobStatus } from '@/modules/ocr/domain/types';
import { getOcrRepository } from '@/modules/ocr';
import type { ExternalExpenseImportStatus } from '../domain/types';
import { findImportByOcrJobId, listImportsForOrg, updateImport } from '../data/imports.repository';

function mapOcrStatusToImport(status: ExtractionJobStatus): ExternalExpenseImportStatus | null {
  if (status === 'needs_review' || status === 'succeeded') return 'needs_review';
  if (status === 'failed') return 'failed';
  if (status === 'queued' || status === 'running' || status === 'processing') return 'ocr_queued';
  return null;
}

export async function syncImportStatusFromOcrJob(
  context: OrgContext,
  ocrJobId: string,
): Promise<void> {
  const repo = getOcrRepository(context.db);
  const job = await repo.findJob(context.organizationId, ocrJobId);
  if (!job) return;

  const imp = await findImportByOcrJobId(context.db, context.organizationId, ocrJobId);
  if (!imp || imp.status === 'linked' || imp.status === 'ignored') return;

  if (job.confirmedExpenseId || job.confirmedVendorBillId || job.confirmedVendorCreditId) {
    await updateImport(context.db, context.organizationId, imp.id, {
      status: 'linked',
      processedAt: new Date(),
      lastCheckedAt: new Date(),
    });
    return;
  }

  const mapped = mapOcrStatusToImport(job.status);
  if (!mapped || mapped === imp.status) return;
  await updateImport(context.db, context.organizationId, imp.id, {
    status: mapped,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    lastCheckedAt: new Date(),
  });
}

export async function syncAllImportStatusesForOrg(context: OrgContext): Promise<number> {
  const imports = await listImportsForOrg(context.db, context.organizationId, {
    statuses: ['detected', 'ocr_queued', 'needs_review', 'failed'],
  });
  let changed = 0;
  for (const imp of imports) {
    if (!imp.ocrJobId) continue;
    const before = imp.status;
    await syncImportStatusFromOcrJob(context, imp.ocrJobId);
    const after = (await findImportByOcrJobId(context.db, context.organizationId, imp.ocrJobId))
      ?.status;
    if (after && after !== before) changed += 1;
  }
  return changed;
}

export async function markExpenseImportLinkedByOcrJob(
  context: OrgContext,
  ocrJobId: string,
): Promise<void> {
  const imp = await findImportByOcrJobId(context.db, context.organizationId, ocrJobId);
  if (!imp) return;
  await updateImport(context.db, context.organizationId, imp.id, {
    status: 'linked',
    processedAt: new Date(),
    lastCheckedAt: new Date(),
  });
}
