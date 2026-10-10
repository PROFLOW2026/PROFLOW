import 'server-only';

import { crossOrgSyncOutbox } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '42P01' || code === '42703';
}

export async function enqueueCrossOrgSyncEvent(
  db: DbExecutor,
  input: {
    readonly mappingId: string;
    readonly developerOrganizationId: string;
    readonly eventType: string;
    readonly idempotencyKey: string;
    readonly payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(crossOrgSyncOutbox).values({
      mappingId: input.mappingId,
      developerOrganizationId: input.developerOrganizationId,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
    });
  } catch (error) {
    if (isMissingRelationError(error)) return;
    const code = (error as { code?: string }).code;
    if (code === '23505') return;
    throw error;
  }
}
