import { and, eq } from 'drizzle-orm';
import {
  contractorComplianceDocuments,
  deliveryItems,
  safetyRecordContractorLinks,
  safetyRecords,
} from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'compliance' track. One resolver per entity type that supports threads/attachments/evidence. */
export const COMPLIANCE_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    entityType: 'compliance_document',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: contractorComplianceDocuments.organizationId,
          projectId: contractorComplianceDocuments.projectId,
          vendorId: contractorComplianceDocuments.vendorId,
          subcontractAgreementId: contractorComplianceDocuments.subcontractAgreementId,
        })
        .from(contractorComplianceDocuments)
        .where(
          and(
            eq(contractorComplianceDocuments.organizationId, organizationId),
            eq(contractorComplianceDocuments.id, entityId),
          ),
        )
        .limit(1);
      return row ? { ...row, internalOnly: false } : null;
    },
  },
  {
    // Existing safety_records; contractor scope only when a contractor link exists and is visible.
    entityType: 'safety_record',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: safetyRecords.organizationId,
          projectId: safetyRecords.projectId,
          vendorId: safetyRecordContractorLinks.vendorId,
          subcontractAgreementId: safetyRecordContractorLinks.subcontractAgreementId,
          contractorVisible: safetyRecordContractorLinks.contractorVisible,
        })
        .from(safetyRecords)
        .leftJoin(
          safetyRecordContractorLinks,
          and(
            eq(safetyRecordContractorLinks.safetyRecordId, safetyRecords.id),
            eq(safetyRecordContractorLinks.organizationId, safetyRecords.organizationId),
          ),
        )
        .where(and(eq(safetyRecords.organizationId, organizationId), eq(safetyRecords.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
        internalOnly: !row.vendorId || row.contractorVisible === false,
      };
    },
  },
  {
    entityType: 'delivery_item',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: deliveryItems.organizationId,
          projectId: deliveryItems.projectId,
          vendorId: deliveryItems.vendorId,
          subcontractAgreementId: deliveryItems.subcontractAgreementId,
          contractorVisible: deliveryItems.contractorVisible,
        })
        .from(deliveryItems)
        .where(and(eq(deliveryItems.organizationId, organizationId), eq(deliveryItems.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
        internalOnly: !row.vendorId || !row.contractorVisible,
      };
    },
  },
];
