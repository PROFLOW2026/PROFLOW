import 'server-only';

import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { takeoffAnalyses } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';

import { TakeoffError } from '../domain/errors';
import { deleteAnalysis } from '../data/takeoff.repository';
import { assertAnalysisAccess, internalActorFrom } from './access';
import { purgeEphemeralAnalysisBytes, TAKEOFF_PERSISTENCE } from './takeoff-persistence';

export async function purgeEphemeralTakeoffUseCase(context: OrgContext, analysisId: string): Promise<void> {
  const analysis = await assertAnalysisAccess(internalActorFrom(context), analysisId, 'manage');
  if (analysis.persistenceMode !== TAKEOFF_PERSISTENCE.ephemeral) {
    throw new TakeoffError('forbidden');
  }
  await purgeEphemeralAnalysisBytes(context.db, context.organizationId, analysisId);
  await deleteAnalysis(context.db, context.organizationId, analysisId);
}

const DEFAULT_TTL_HOURS = 6;

export function takeoffEphemeralTtlHours(): number {
  const raw = Number(process.env.TAKEOFF_EPHEMERAL_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
}

export function ephemeralExpiryDate(from: Date = new Date()): Date {
  const hours = takeoffEphemeralTtlHours();
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/** Service/admin: purge expired ephemeral analyses (bytes + DB row). */
export async function purgeExpiredEphemeralTakeoffs(db: DbExecutor, now: Date = new Date()): Promise<number> {
  const expired = await db
    .select({ id: takeoffAnalyses.id, organizationId: takeoffAnalyses.organizationId })
    .from(takeoffAnalyses)
    .where(
      and(
        eq(takeoffAnalyses.persistenceMode, TAKEOFF_PERSISTENCE.ephemeral),
        isNotNull(takeoffAnalyses.ephemeralExpiresAt),
        lt(takeoffAnalyses.ephemeralExpiresAt, now),
      ),
    )
    .limit(50);

  let count = 0;
  for (const row of expired) {
    await purgeEphemeralAnalysisBytes(db, row.organizationId, row.id);
    await deleteAnalysis(db, row.organizationId, row.id);
    count += 1;
  }
  return count;
}