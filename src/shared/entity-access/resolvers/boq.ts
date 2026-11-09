import { and, eq } from 'drizzle-orm';
import { boqProgressBatches } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers for BOQ entities that support evidence / attachments. */

const boqProgressBatchResolver: EntityAccessResolver = {
  entityType: 'boq_progress_batch',
  async resolve(db: DbExecutor, organizationId: string, entityId: string) {
    const [row] = await db
      .select({
        organizationId: boqProgressBatches.organizationId,
        projectId: boqProgressBatches.projectId,
      })
      .from(boqProgressBatches)
      .where(
        and(eq(boqProgressBatches.organizationId, organizationId), eq(boqProgressBatches.id, entityId)),
      )
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      projectId: row.projectId,
      vendorId: null,
      internalOnly: true,
    };
  },
};

export const BOQ_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [boqProgressBatchResolver];
