import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { externalExpenseImports } from '@drizzle/schema';
import { findOrganizationById } from '@/modules/tenancy';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { EXPENSE_INGESTION_PROVIDER_KEY } from '../domain/settings';
import { pollSumitExpensesForOrg } from './poll-sumit-expenses';
import { getAdminDb } from '@/shared/db/client';
import type { OrgContext } from '@/shared/auth/context';
import { drainDurableOcrQueue } from '@/modules/ocr/application/drain-queue';

const WORKER_USER_ID = '00000000-0000-4000-8000-000000000002';

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

async function listEnabledOrganizationIds(): Promise<string[]> {
  const db = getAdminDb();
  const result = await db.execute(sql`
    SELECT DISTINCT os.organization_id AS id
    FROM organization_settings os
    INNER JOIN external_invoicing_provider_connections c
      ON c.organization_id = os.organization_id
      AND c.status = 'connected'
      AND c.provider_id = 'sumit'
    WHERE os.key = ${EXPENSE_INGESTION_PROVIDER_KEY}
      AND os.value::text = '"sumit"'
  `);
  return sqlResultRows<{ id: string }>(result)
    .map((row) => row.id)
    .filter(Boolean);
}

export async function drainSumitExpenseIngestion(): Promise<{
  readonly organizations: number;
  readonly detected: number;
  readonly queued: number;
  readonly ocrProcessed: number;
  readonly errors: number;
}> {
  const orgIds = await listEnabledOrganizationIds();
  const db = getAdminDb();
  let detected = 0;
  let queued = 0;
  let errors = 0;

  for (const organizationId of orgIds) {
    const organization = await findOrganizationById(db, organizationId);
    if (!organization) continue;

    const context: OrgContext = {
      userId: WORKER_USER_ID,
      organizationId,
      membershipId: WORKER_USER_ID,
      organization,
      permissions: new Set([PERMISSIONS.DOCUMENTS_MANAGE]),
      roleKeys: ['sumit_expense_worker'],
      db,
      locale: organization.defaultLocale || 'en',
    };

    try {
      const result = await pollSumitExpensesForOrg(context);
      detected += result.detected;
      queued += result.queued;
      errors += result.errors;
    } catch {
      errors += 1;
    }
  }

  const ocr = await drainDurableOcrQueue({ limit: 10 });
  return {
    organizations: orgIds.length,
    detected,
    queued,
    ocrProcessed: ocr.processed,
    errors,
  };
}

/** Count imports still active — for ops visibility. */
export async function countActiveSumitImports(): Promise<number> {
  const db = getAdminDb();
  const rows = await db
    .select({ id: externalExpenseImports.id })
    .from(externalExpenseImports)
    .where(
      and(
        eq(externalExpenseImports.provider, 'sumit'),
        sql`${externalExpenseImports.status} IN ('detected', 'ocr_queued', 'needs_review', 'failed')`,
      ),
    );
  return rows.length;
}
