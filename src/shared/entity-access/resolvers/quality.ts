import { and, eq } from 'drizzle-orm';
import { defects, qualityInspections } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { EntityAccessResolver, EntityScope } from '../types';

/** Entity access resolvers owned by the 'quality' track. One resolver per entity type that supports threads/attachments/evidence. */

const inspectionResolver: EntityAccessResolver = {
  entityType: 'inspection',
  async resolve(db: DbExecutor, organizationId: string, entityId: string): Promise<EntityScope | null> {
    const [row] = await db
      .select({
        organizationId: qualityInspections.organizationId,
        projectId: qualityInspections.projectId,
        vendorId: qualityInspections.vendorId,
        subcontractAgreementId: qualityInspections.subcontractAgreementId,
        contractorVisible: qualityInspections.contractorVisible,
      })
      .from(qualityInspections)
      .where(and(eq(qualityInspections.organizationId, organizationId), eq(qualityInspections.id, entityId)))
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      projectId: row.projectId,
      vendorId: row.vendorId,
      subcontractAgreementId: row.subcontractAgreementId,
      internalOnly: !row.contractorVisible || !row.vendorId,
    };
  },
};

const defectResolver: EntityAccessResolver = {
  entityType: 'defect',
  async resolve(db: DbExecutor, organizationId: string, entityId: string): Promise<EntityScope | null> {
    const [row] = await db
      .select({
        organizationId: defects.organizationId,
        projectId: defects.projectId,
        vendorId: defects.vendorId,
        subcontractAgreementId: defects.subcontractAgreementId,
        contractorVisible: defects.contractorVisible,
      })
      .from(defects)
      .where(and(eq(defects.organizationId, organizationId), eq(defects.id, entityId)))
      .limit(1);
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      projectId: row.projectId,
      vendorId: row.vendorId,
      subcontractAgreementId: row.subcontractAgreementId,
      internalOnly: !row.contractorVisible || !row.vendorId,
    };
  },
};

export const QUALITY_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [inspectionResolver, defectResolver];
