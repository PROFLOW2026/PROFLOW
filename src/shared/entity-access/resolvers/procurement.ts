import { and, eq } from 'drizzle-orm';
import {
  contractorTenderPackages,
  contractorWarrantyReports,
  subcontractAgreementCloseouts,
} from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'procurement' track. */
export const PROCUREMENT_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    entityType: 'tender_package',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: contractorTenderPackages.organizationId,
          projectId: contractorTenderPackages.projectId,
        })
        .from(contractorTenderPackages)
        .where(
          and(eq(contractorTenderPackages.organizationId, organizationId), eq(contractorTenderPackages.id, entityId)),
        )
        .limit(1);
      return row ? { ...row, vendorId: null, subcontractAgreementId: null, internalOnly: false } : null;
    },
  },
  {
    entityType: 'agreement_closeout',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: subcontractAgreementCloseouts.organizationId,
          projectId: subcontractAgreementCloseouts.projectId,
          vendorId: subcontractAgreementCloseouts.vendorId,
          subcontractAgreementId: subcontractAgreementCloseouts.subcontractAgreementId,
        })
        .from(subcontractAgreementCloseouts)
        .where(
          and(
            eq(subcontractAgreementCloseouts.organizationId, organizationId),
            eq(subcontractAgreementCloseouts.id, entityId),
          ),
        )
        .limit(1);
      return row ? { ...row, internalOnly: false } : null;
    },
  },
  {
    entityType: 'contractor_warranty_report',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: contractorWarrantyReports.organizationId,
          projectId: contractorWarrantyReports.projectId,
          vendorId: contractorWarrantyReports.vendorId,
          subcontractAgreementId: contractorWarrantyReports.subcontractAgreementId,
        })
        .from(contractorWarrantyReports)
        .where(
          and(eq(contractorWarrantyReports.organizationId, organizationId), eq(contractorWarrantyReports.id, entityId)),
        )
        .limit(1);
      return row ? { ...row, internalOnly: false } : null;
    },
  },
];
