import { and, eq } from 'drizzle-orm';
import {
  subcontractAgreements,
  subcontractChanges,
  subcontractUnpricedWork,
  subcontractWorkLines,
} from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'subcontract' track. One resolver per entity type that supports threads/attachments/evidence. */
export const SUBCONTRACT_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    entityType: 'subcontract_agreement',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractAgreements.projectId,
          vendorId: subcontractAgreements.vendorId,
          id: subcontractAgreements.id,
        })
        .from(subcontractAgreements)
        .where(and(eq(subcontractAgreements.organizationId, organizationId), eq(subcontractAgreements.id, entityId)))
        .limit(1);
      return row
        ? { organizationId, projectId: row.projectId, vendorId: row.vendorId, subcontractAgreementId: row.id }
        : null;
    },
  },
  {
    entityType: 'subcontract_work_line',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractWorkLines.projectId,
          vendorId: subcontractWorkLines.vendorId,
          agreementId: subcontractWorkLines.agreementId,
        })
        .from(subcontractWorkLines)
        .where(and(eq(subcontractWorkLines.organizationId, organizationId), eq(subcontractWorkLines.id, entityId)))
        .limit(1);
      return row
        ? { organizationId, projectId: row.projectId, vendorId: row.vendorId, subcontractAgreementId: row.agreementId }
        : null;
    },
  },
  {
    entityType: 'subcontract_change',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractChanges.projectId,
          vendorId: subcontractChanges.vendorId,
          agreementId: subcontractChanges.agreementId,
          status: subcontractChanges.status,
          createdActorType: subcontractChanges.createdActorType,
        })
        .from(subcontractChanges)
        .where(and(eq(subcontractChanges.organizationId, organizationId), eq(subcontractChanges.id, entityId)))
        .limit(1);
      return row
        ? {
            organizationId,
            projectId: row.projectId,
            vendorId: row.vendorId,
            subcontractAgreementId: row.agreementId,
            internalOnly: row.status === 'draft' && row.createdActorType !== 'external',
          }
        : null;
    },
  },
  {
    entityType: 'unpriced_work',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractUnpricedWork.projectId,
          vendorId: subcontractUnpricedWork.vendorId,
          agreementId: subcontractUnpricedWork.agreementId,
        })
        .from(subcontractUnpricedWork)
        .where(and(eq(subcontractUnpricedWork.organizationId, organizationId), eq(subcontractUnpricedWork.id, entityId)))
        .limit(1);
      return row
        ? { organizationId, projectId: row.projectId, vendorId: row.vendorId, subcontractAgreementId: row.agreementId }
        : null;
    },
  },
];
