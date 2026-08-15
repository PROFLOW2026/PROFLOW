import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { ocrExtractionJobs } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb } from '@/shared/db/client';
import { findOrganizationById } from '@/modules/tenancy';
import { getOcrProvider } from '../domain/provider-registry';
import { createDrizzleOcrRepository } from '../data/drizzle-ocr.repository';
import { processQueuedJob } from './process-job';

const DEFAULT_LEASE_SECONDS = 600;
const DEFAULT_BATCH = 5;
const WORKER_USER_ID = '00000000-0000-4000-8000-000000000001';

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function workerToken(): string {
  return `ocr-worker:${process.env.VERCEL_REGION ?? 'local'}:${process.pid}`;
}

/**
 * Trusted OCR worker. Claims one queued/stale job at a time via SQL so two
 * isolates cannot run Azure for the same row. Uses the admin connection because
 * this is a system job, not a browser request.
 */
export async function drainDurableOcrQueue(
  options: { readonly limit?: number; readonly workerToken?: string } = {},
): Promise<{ readonly claimed: number; readonly processed: number }> {
  const db = getAdminDb();
  const token = options.workerToken ?? workerToken();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_BATCH, 25));
  const provider = getOcrProvider();
  let claimed = 0;
  let processed = 0;

  for (let i = 0; i < limit; i += 1) {
    const result = await db.execute(sql`
      SELECT app.claim_ocr_job(${token}, ${DEFAULT_LEASE_SECONDS}) AS id
    `);
    const row = sqlResultRows<{ id?: string | null }>(result)[0];
    const jobId = row?.id ?? null;
    if (!jobId) break;
    claimed += 1;

    const [job] = await db
      .select({
        id: ocrExtractionJobs.id,
        organizationId: ocrExtractionJobs.organizationId,
      })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, jobId))
      .limit(1);
    if (!job) continue;

    const organization = await findOrganizationById(db, job.organizationId);
    if (!organization) continue;

    const context: OrgContext = {
      userId: WORKER_USER_ID,
      organizationId: job.organizationId,
      membershipId: WORKER_USER_ID,
      organization,
      permissions: new Set(),
      roleKeys: ['ocr_worker'],
      db,
      locale: organization.defaultLocale || 'en',
    };
    const repo = createDrizzleOcrRepository(db);
    await processQueuedJob(context, job.id, provider, repo, { alreadyClaimed: true });
    processed += 1;
  }

  return { claimed, processed };
}
