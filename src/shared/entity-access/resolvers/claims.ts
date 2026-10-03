import { and, eq } from 'drizzle-orm';
import { subcontractClaimLines, subcontractClaims, subcontractDeductions } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/**
 * Entity access resolvers owned by the 'claims' track. Claims are financial: the resolver reads through
 * the caller's RLS-bound executor, so callers without claim.view / ext.claim.* get null.
 */
export const CLAIMS_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    entityType: 'claim',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractClaims.projectId,
          vendorId: subcontractClaims.vendorId,
          agreementId: subcontractClaims.agreementId,
          status: subcontractClaims.status,
          createdActorType: subcontractClaims.createdActorType,
        })
        .from(subcontractClaims)
        .where(and(eq(subcontractClaims.organizationId, organizationId), eq(subcontractClaims.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.agreementId,
        // A claim drafted by the project team is not contractor-facing until submitted.
        internalOnly: row.status === 'draft' && row.createdActorType === 'internal',
      };
    },
  },
  {
    entityType: 'claim_line',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractClaims.projectId,
          vendorId: subcontractClaims.vendorId,
          agreementId: subcontractClaims.agreementId,
          status: subcontractClaims.status,
          createdActorType: subcontractClaims.createdActorType,
        })
        .from(subcontractClaimLines)
        .innerJoin(
          subcontractClaims,
          and(
            eq(subcontractClaims.id, subcontractClaimLines.claimId),
            eq(subcontractClaims.organizationId, subcontractClaimLines.organizationId),
          ),
        )
        .where(and(eq(subcontractClaimLines.organizationId, organizationId), eq(subcontractClaimLines.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.agreementId,
        internalOnly: row.status === 'draft' && row.createdActorType === 'internal',
      };
    },
  },
  {
    entityType: 'deduction',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: subcontractDeductions.projectId,
          vendorId: subcontractDeductions.vendorId,
          agreementId: subcontractDeductions.agreementId,
          contractorVisible: subcontractDeductions.contractorVisible,
        })
        .from(subcontractDeductions)
        .where(and(eq(subcontractDeductions.organizationId, organizationId), eq(subcontractDeductions.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.agreementId,
        internalOnly: !row.contractorVisible,
      };
    },
  },
];
