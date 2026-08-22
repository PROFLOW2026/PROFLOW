/**
 * BOQ double-billing guard helpers for billing-plan cycle issue.
 */

import { and, eq, isNull } from 'drizzle-orm';
import {
  boqProgressBatches,
  boqProgressBillingLinks,
  boqProgressLines,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/**
 * True when the BOQ node already has a non-voided progress-billing link
 * or a progress batch in `billed` status (claimed for billing).
 */
export async function boqNodeHasProgressBillingClaimOrLink(
  db: DbExecutor,
  organizationId: string,
  boqNodeId: string,
): Promise<boolean> {
  const [link] = await db
    .select({ id: boqProgressBillingLinks.id })
    .from(boqProgressBillingLinks)
    .innerJoin(
      boqProgressBatches,
      and(
        eq(boqProgressBatches.id, boqProgressBillingLinks.progressBatchId),
        eq(boqProgressBatches.organizationId, boqProgressBillingLinks.organizationId),
      ),
    )
    .innerJoin(
      boqProgressLines,
      and(
        eq(boqProgressLines.batchId, boqProgressBatches.id),
        eq(boqProgressLines.organizationId, boqProgressBatches.organizationId),
      ),
    )
    .where(
      and(
        eq(boqProgressBillingLinks.organizationId, organizationId),
        eq(boqProgressLines.boqNodeId, boqNodeId),
        isNull(boqProgressBillingLinks.voidedAt),
      ),
    )
    .limit(1);
  if (link) return true;

  const [claimed] = await db
    .select({ id: boqProgressLines.id })
    .from(boqProgressLines)
    .innerJoin(
      boqProgressBatches,
      and(
        eq(boqProgressBatches.id, boqProgressLines.batchId),
        eq(boqProgressBatches.organizationId, boqProgressLines.organizationId),
      ),
    )
    .where(
      and(
        eq(boqProgressLines.organizationId, organizationId),
        eq(boqProgressLines.boqNodeId, boqNodeId),
        eq(boqProgressBatches.status, 'billed'),
      ),
    )
    .limit(1);

  return Boolean(claimed);
}
