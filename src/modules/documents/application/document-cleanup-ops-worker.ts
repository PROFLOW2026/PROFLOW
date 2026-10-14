import 'server-only';

import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { listActiveOrganizationIds } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { resolveOrgContext } from '@/modules/tenancy';
import { planFailedDocumentCleanups, type DocumentCleanupPlanRow } from './manage-document';

const DEFAULT_REPORT_LIMIT = Number(process.env.DOCUMENT_CLEANUP_REPORT_LIMIT ?? 25);

export interface DocumentCleanupOpsReport {
  readonly mode: 'report';
  readonly orgsScanned: number;
  readonly candidates: number;
  readonly sample: readonly DocumentCleanupPlanRow[];
}

async function withOrgOwnerContext<T>(
  userId: string,
  organizationId: string,
  locale: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  return withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId, organizationId, locale });
    return fn(context);
  });
}

/** Daily cron: report-only; never deletes cloud objects (D03 / OD-71). */
export async function runDocumentCleanupOpsWorker(options?: {
  readonly limitPerOrg?: number;
}): Promise<DocumentCleanupOpsReport> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);
  const limitPerOrg = options?.limitPerOrg ?? DEFAULT_REPORT_LIMIT;
  const sample: DocumentCleanupPlanRow[] = [];
  let candidates = 0;

  for (const orgRow of orgRows) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) continue;
      const locale = orgRow.defaultLocale || 'he-IL';
      const rows = await withOrgOwnerContext(owner.userId, orgRow.id, locale, (context) =>
        planFailedDocumentCleanups(context, { limit: limitPerOrg }),
      );
      candidates += rows.length;
      for (const row of rows) {
        if (sample.length >= 10) break;
        sample.push(row);
      }
      if (sample.length >= 10) break;
    } catch {
      // Report worker must not fail the bundle; skip org on error.
    }
  }

  return {
    mode: 'report',
    orgsScanned: orgRows.length,
    candidates,
    sample,
  };
}
