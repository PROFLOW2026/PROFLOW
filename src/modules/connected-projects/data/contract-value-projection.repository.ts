import 'server-only';

import { connectedContractValueProjections } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BusinessDate } from '@/shared/dates';

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '42P01' || code === '42703';
}

export async function upsertContractValueProjection(
  db: DbExecutor,
  input: {
    readonly mappingId: string;
    readonly contractorOrganizationId: string;
    readonly contractorProjectId: string;
    readonly sourceKind: string;
    readonly sourceId: string;
    readonly amountNet: string;
    readonly currency: string;
    readonly effectiveDate: BusinessDate;
    readonly idempotencyKey: string;
  },
): Promise<void> {
  try {
    await db
      .insert(connectedContractValueProjections)
      .values({
        mappingId: input.mappingId,
        contractorOrganizationId: input.contractorOrganizationId,
        contractorProjectId: input.contractorProjectId,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        amountNet: input.amountNet,
        currency: input.currency,
        effectiveDate: input.effectiveDate,
        idempotencyKey: input.idempotencyKey,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: connectedContractValueProjections.idempotencyKey,
        set: {
          amountNet: input.amountNet,
          currency: input.currency,
          effectiveDate: input.effectiveDate,
          status: 'active',
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    if (isMissingRelationError(error)) return;
    const code = (error as { code?: string }).code;
    if (code === '23505') return;
    throw error;
  }
}
